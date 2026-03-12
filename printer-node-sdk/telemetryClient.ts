import fetch from 'node-fetch';

const PPOS_GATEWAY_URL = process.env.PPOS_GATEWAY_URL || 'http://localhost:8000';

export async function sendStatusUpdate(jobId: string, status: string, extra: any = {}): Promise<void> {
    console.log(`[Telemetry] Feeding back status: ${status} for job ${jobId}`);

    try {
        const response = await fetch(`${PPOS_GATEWAY_URL}/api/v1/telemetry/${jobId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status,
                timestamp: new Date().toISOString(),
                ...extra
            })
        });

        if (!response.ok) {
            console.error(`[Telemetry Error] Failed to send update: ${response.status}`);
        }
    } catch (err: any) {
        console.error(`[Telemetry Network Error] ${err.message}`);
    }
}
