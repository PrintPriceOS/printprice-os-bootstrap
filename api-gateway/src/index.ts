import "dotenv/config";
import { Connection, Client } from '@temporalio/client';
import express, { Request, Response, NextFunction } from 'express';
import nodeRouter from './nodeRegistry';
import telemetryRouter from './telemetryReceiver';
import { v4 as uuidv4 } from 'uuid';
import { getSystemSaturationMetrics } from './metricsClient';
import { trace, context } from '@opentelemetry/api';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'api-gateway'
  });
});
app.use('/api/v1/nodes', nodeRouter);
app.use('/api/v1/telemetry', telemetryRouter);

// Strict Typed DTO
interface JobRequestDTO {
    idempotencyKey: string;
    assetUrl: string;
    contractedSlaMs: number;
    specs: {
        pages: number;
        format: string;
        [key: string]: any;
    };
}

// Admission Control Middleware
async function admissionControl(req: Request, res: Response, next: NextFunction) {
    const tier = (req.headers['x-tier'] as string) || 'STANDARD';
    const metrics = await getSystemSaturationMetrics();

    let systemState = 'NORMAL';
    if (metrics.cpuSaturation > 90 || metrics.queueDepth > 10000) systemState = 'PROTECTED';
    else if (metrics.errorRate > 0.05 || metrics.predictiveEta > req.body.contractedSlaMs) systemState = 'DEGRADED';

    if (systemState === 'PROTECTED' && tier !== 'ENTERPRISE') {
        res.set('Retry-After', '300');
        return res.status(429).json({
            error_code: 'ADMISSION_CONTROL_PROTECTED',
            message: 'System under extreme load. Resubmit later.',
            system_state: 'PROTECTED',
            diagnostics: metrics
        });
    }

    if (systemState === 'DEGRADED' && tier === 'STANDARD') {
        return res.status(503).json({
            error_code: 'SLA_BREACH_PREDICTED',
            message: 'Current capacity cannot guarantee requested SLA.',
            proposed_eta: metrics.predictiveEta,
            system_state: 'DEGRADED'
        });
    }
    next();
}

app.post('/jobs', admissionControl, async (req: Request, res: Response) => {
    const payload = req.body as JobRequestDTO;
    if (!payload.idempotencyKey || !payload.assetUrl || !payload.specs) {
        return res.status(400).json({ error_code: 'BAD_REQUEST', message: 'Missing required fields' });
    }

    // OTel Context Correlation
    const tracer = trace.getTracer('api-gateway');
    await tracer.startActiveSpan('POST /jobs', async (span) => {
        try {
            const jobId = uuidv4();
            const traceId = span.spanContext().traceId;

            span.setAttribute('ppos.global_job_id', jobId);
            span.setAttribute('ppos.idempotency_key', payload.idempotencyKey);

            const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS || 'localhost:7233' });
            const client = new Client({ connection });

            // Start workflow with idempotencyKey used as workflowId to prevent duplicates
            const handle = await client.workflow.start('GlobalJobWorkflow', {
                taskQueue: 'printprice-jobs',
                workflowId: `job-${payload.idempotencyKey}`,
                args: [jobId, traceId, payload.assetUrl, payload.specs],
            });

            res.status(202).json({
                global_job_id: jobId,
                trace_id: traceId,
                temporal_workflow_id: handle.workflowId,
                status: 'INGESTED'
            });
        } catch (error: any) {
            span.recordException(error);

            if (error.name === 'WorkflowExecutionAlreadyStartedError') {
                return res.status(409).json({ error_code: 'DUPLICATE_IDEMPOTENCY_KEY', message: 'Job already accepted' });
            }

            res.status(500).json({ error_code: 'INTERNAL_SERVER_ERROR', message: 'Failed to ingest job.' });
        } finally {
            span.end();
        }
    });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`API Gateway listening on port ${PORT}`);
});
