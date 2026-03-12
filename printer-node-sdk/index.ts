import express, { Request, Response } from 'express';
import { sendStatusUpdate } from './telemetryClient';

const app = express();
app.use(express.json());

// 1. Health Endpoint (FEP Section 8)
app.get('/health', (req: Request, res: Response) => {
    res.json({
        node_status: 'ONLINE',
        current_capacity_utilization: 10.5,
        active_jobs_in_queue: 0,
        machine_uptime_seconds: 3600
    });
});

// 2. Dispatch Endpoint (FEP Section 3)
app.post('/dispatch', async (req: Request, res: Response) => {
    const { global_job_id, production_specs, pdf_asset_url, manufacturing_deadline } = req.body;

    console.log(`[Printer Node] Received Job Dispatch: ${global_job_id}`);
    console.log(`[Specs] ${JSON.stringify(production_specs)}`);

    // In a real node, we'd check availability here
    const canAccept = true;

    if (!canAccept) {
        return res.status(406).json({ error: 'Capacity exceeded' });
    }

    // Acknowledge receipt
    res.status(202).json({ status: 'JOB_RECEIVED' });

    // Simulate production lifecycle
    setTimeout(async () => {
        await sendStatusUpdate(global_job_id, 'JOB_ACCEPTED');

        setTimeout(async () => {
            await sendStatusUpdate(global_job_id, 'IN_PRESS', { machine_id: 'PRINTER_01' });

            setTimeout(async () => {
                await sendStatusUpdate(global_job_id, 'SHIPPED', { tracking_number: 'TRK-123456' });
            }, 5000);
        }, 5000);
    }, 2000);
});

const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
    console.log(`Reference Printer Node listening on port ${PORT}`);
});
