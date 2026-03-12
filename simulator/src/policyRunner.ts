import { HistoricalJob, NodeCandidate, RoutingDecision } from './types';

export class PolicyRunner {
    // Phase 17 Refined Weights (from spec)
    private readonly weights = {
        premier_risk: 0.005,
        certified_risk: 0.02,
        sandbox_risk: 0.08,
        operational_overhead: 250 // Base cost of an SLA breach (USD)
    };

    /**
     * Track 1: Baseline Routing (Matches pre-economics "Price + Reputation" logic)
     */
    public runBaseline(job: HistoricalJob, candidates: NodeCandidate[]): RoutingDecision {
        const results = candidates.map(node => {
            // Baseline Score = (Price Score * 0.5) + (Reputation Score * 0.5)
            // Lower is better for cost, Higher is better for reputation
            const priceScore = node.manufacturingCost / 1000; // Normalized
            const reputationScore = (100 - node.reputationScore) / 100; // Normalized penalty

            const score = (priceScore * 0.5) + (reputationScore * 0.5);

            return {
                nodeId: node.nodeId,
                score,
                mfg: node.manufacturingCost
            };
        });

        const best = results.sort((a, b) => a.score - b.score)[0];
        return {
            nodeId: best.nodeId,
            totalExpectedCost: best.mfg,
            breakdown: { mfg: best.mfg, ship: 0, risk: 0, sla: 0 }
        };
    }

    /**
     * Track 2: Economics Policy v1 (Materializes Phase 17 Spec)
     */
    public runEconomicsV1(job: HistoricalJob, candidates: NodeCandidate[]): RoutingDecision {
        const results = candidates.map(node => {
            const mfg = node.manufacturingCost;

            // 1. Geography Penalty (Mocked Haversine Logic)
            const ship = this.calculateShippingCost(job, node);

            // 2. Risk Premium (Bounded by spec)
            const riskFactor = node.tier === 'PREMIER' ? this.weights.premier_risk :
                node.tier === 'CERTIFIED' ? this.weights.certified_risk :
                    this.weights.sandbox_risk;
            const risk = job.value * riskFactor;

            // 3. Expected SLA Breach (Normalized)
            const breachProbability = (100 - node.reputationScore) / 100;
            const sla = breachProbability * (job.value + this.weights.operational_overhead);

            const total = mfg + ship + risk + sla;

            return {
                nodeId: node.nodeId,
                totalExpectedCost: total,
                breakdown: { mfg, ship, risk, sla }
            };
        });

        return results.sort((a, b) => a.totalExpectedCost - b.totalExpectedCost)[0];
    }

    private calculateShippingCost(job: HistoricalJob, node: NodeCandidate): number {
        if (job.destCountry !== node.countryCode) return 50.0; // Cross-border penalty
        return 5.0; // Domestic flat rate
    }
}
