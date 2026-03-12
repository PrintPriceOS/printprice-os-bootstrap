import { db } from './db';
import { HistoricalJob, CustomerTier, JobOutcome } from './types';

export class JobStratifier {
    private readonly sampleSize = 1000;

    /**
     * Extracts jobs from MySQL based on the stratification matrix.
     */
    public async extractStratifiedSample(seed: string): Promise<HistoricalJob[]> {
        console.log(`[Stratifier] Extracting ${this.sampleSize} jobs with seed: ${seed}`);

        // Distribution targets: 300 Enterprise, 400 Premium, 300 Standard
        const queries = [
            this.queryCohort('ENTERPRISE', 300, seed),
            this.queryCohort('PREMIUM', 400, seed),
            this.queryCohort('STANDARD', 300, seed)
        ];

        const results = await Promise.all(queries);
        const unifiedSample = results.flat();

        console.log(`[Stratifier] Dataset extraction complete. Size: ${unifiedSample.length}`);
        return unifiedSample;
    }

    private async queryCohort(tier: CustomerTier, count: number, seed: string): Promise<HistoricalJob[]> {
        const [rows]: any = await db.query(
            `SELECT 
                jr.job_id as jobId, 
                '${tier}' as customerTier, 
                COALESCE(jr.total_price, 50.0) as value, 
                jr.current_stage as rawOutcome,
                jr.origin_country as originCountry, 
                jr.destination_country as destCountry,
                jr.created_at as timestamp,
                jr.technical_specs as specs_json
             FROM canonical_job_registry jr
             WHERE jr.customer_tier = ?
             ORDER BY RAND(?)
             LIMIT ?`,
            [tier, seed, count]
        );

        return rows.map((r: any) => ({
            ...r,
            specs: r.specs_json ? JSON.parse(r.specs_json) : { pages: 100, format: 'A4', binding: 'PERFECT' },
            outcome: this.mapOutcome(r.rawOutcome)
        }));
    }

    private mapOutcome(stage: string): JobOutcome {
        if (stage === 'COMPLETED') return 'SUCCESS';
        if (stage === 'REROUTED') return 'REROUTED';
        if (stage === 'BREACHED' || stage === 'LATE') return 'BREACHED';
        return 'SUCCESS';
    }
}
