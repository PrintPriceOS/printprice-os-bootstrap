import { Router, Request, Response } from 'express';
import { db } from './db';
import { Connection, Client } from '@temporalio/client';
import { trace } from '@opentelemetry/api';

const router = Router();

router.post('/:global_job_id', async (req: Request, res: Response) => {
    const { global_job_id } = req.params;
    const { status, timestamp, machine_id, progress_percentage, optional_error_code, tracking_number } = req.body;

    if (!status) {
        return res.status(400).json({ error: 'Status is required' });
    }

    const tracer = trace.getTracer('telemetry-receiver');
    await tracer.startActiveSpan(`Telemetry ${status}`, async (span) => {
        try {
            // 1. Find the workflow_id associated with this global_job_id
            const [rows]: any = await db.query(
                'SELECT workflow_id, trace_id FROM canonical_job_registry WHERE job_id = ?',
                [global_job_id]
            );

            if (!rows || rows.length === 0) {
                return res.status(404).json({ error: 'Job not found in registry' });
            }

            const { workflow_id, trace_id } = rows[0];
            span.setAttribute('ppos.global_job_id', global_job_id);
            span.setAttribute('ppos.parent_trace_id', trace_id);

            // 2. Map status to Temporal signals
            const temporalAddress = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
            const connection = await Connection.connect({ address: temporalAddress });
            const client = new Client({ connection });
            const handle = client.workflow.getHandle(workflow_id);

            let signalName: string | null = null;
            let signalPayload: any = {};

            switch (status) {
                case 'JOB_ACCEPTED':
                    signalName = 'NODE_ACCEPTED';
                    signalPayload = { nodeId: 'unknown-set-by-auth' }; // In real app, derived from mTLS/JWT
                    break;
                case 'FAILED':
                    signalName = 'NODE_REJECTED';
                    signalPayload = { reason: optional_error_code || 'PROD_FAILURE' };
                    break;
                case 'IN_PRESS':
                    signalName = 'NODE_IN_PRESS';
                    break;
                case 'SHIPPED':
                    signalName = 'NODE_SHIPPED';
                    signalPayload = { trackingCode: tracking_number || 'UNKNOWN' };
                    break;
                // Other statuses (FINISHED, BINDING) update registry but might not trigger signals
            }

            if (signalName) {
                await handle.signal(signalName, signalPayload);
            }

            // 3. Update Registry/Ledger (Triggered by signal eventually in workflow, 
            // but we log the raw event here too for audit)
            await db.execute(
                `INSERT INTO job_events_ledger (event_id, job_id, previous_stage, new_stage, trigger_activity, trace_id, event_payload)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
                [global_job_id, 'TELEMETRY_IN', status, 'TelemetryReceiver', trace_id, JSON.stringify(req.body)]
            );

            res.status(202).json({ status: 'PROCESSED' });
        } catch (err: any) {
            console.error('Telemetry processing failed:', err);
            span.recordException(err);
            res.status(500).json({ error: 'Telemetry ingestion failed' });
        } finally {
            span.end();
        }
    });
});

export default router;
