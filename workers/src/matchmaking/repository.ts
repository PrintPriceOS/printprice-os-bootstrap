import { db } from '../db';
import { PrinterNodeCapabilities } from './types';

export async function getActivePrinterNodes(): Promise<PrinterNodeCapabilities[]> {
    const [rows]: any = await db.query(
        `SELECT node_id, country_code, capabilities_hash, reputation_score 
     FROM printer_nodes 
     WHERE status = 'ACTIVE' 
     ORDER BY reputation_score DESC`
    );

    // Decoding capability_hash would ideally map to JSON features. Mocking expansion here.
    return rows.map((r: any) => ({
        nodeId: r.node_id,
        countryCode: r.country_code,
        supportedFormats: ['A4', 'US_LETTER', 'A5'], // Mock decoded capabilities
        supportedBindings: ['perfect', 'saddle_stitch'],
        hasColorCapacity: true,
        reputationScore: parseFloat(r.reputation_score)
    }));
}
