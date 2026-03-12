import { db } from './db';
import { HistoricalJob, NodeCandidate } from './types';

export class CandidateReconstructor {
    /**
     * Rebuilds the pool of nodes that COULD have taken the job.
     */
    public async reconstructPool(job: HistoricalJob): Promise<NodeCandidate[]> {
        // Query nodes that were active at the time or currently available
        const [rows]: any = await db.query(
            `SELECT 
                node_id as nodeId,
                reputation_score as reputationScore,
                status as rawTier,
                country_code as countryCode,
                city,
                15.0 as manufacturingCost -- Mocked base manufacturing cost
             FROM printer_nodes
             WHERE status IN ('ACTIVE', 'CERTIFIED', 'PREMIER')`
        );

        return rows.map((r: any) => ({
            nodeId: r.nodeId,
            reputationScore: r.reputationScore,
            tier: r.rawTier === 'PREMIER' ? 'PREMIER' : 'CERTIFIED',
            countryCode: r.countryCode,
            city: r.city,
            manufacturingCost: r.manufacturingCost
        }));
    }
}
