export interface PrinterNodeCapabilities {
    nodeId: string;
    countryCode: string;
    supportedFormats: string[];
    supportedBindings: string[];
    hasColorCapacity: boolean;
    reputationScore: number;
}

export interface MatchCandidate {
    nodeId: string;
    countryCode: string;
    estimatedSlaHours: number;
    matchScore: number; // 0-100 routing fitness
}

export interface RoutingDecision {
    jobId: string;
    primaryCandidate: MatchCandidate;
    fallbackCandidates: MatchCandidate[];
}
