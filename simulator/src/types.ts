export type CustomerTier = 'STANDARD' | 'PREMIUM' | 'ENTERPRISE';
export type JobOutcome = 'SUCCESS' | 'REROUTED' | 'BREACHED' | 'FAILED_PREFLIGHT';

export interface HistoricalJob {
    jobId: string;
    customerTier: CustomerTier;
    value: number;
    outcome: JobOutcome;
    originCountry: string;
    destCountry: string;
    timestamp: string;
    specs: {
        pages: number;
        format: string;
        binding: string;
    };
    actualNodeId?: string;
    actualManufacturingCost?: number;
}

export interface NodeCandidate {
    nodeId: string;
    reputationScore: number;
    tier: 'SANDBOX' | 'CERTIFIED' | 'PREMIER';
    countryCode: string;
    city: string;
    manufacturingCost: number;
    distanceKm?: number;
}

export interface RoutingDecision {
    nodeId: string;
    totalExpectedCost: number;
    breakdown: {
        mfg: number;
        ship: number;
        risk: number;
        sla: number;
        saturation?: number;
    };
}
