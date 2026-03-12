import { ApplicationFailure } from '@temporalio/workflow';

export abstract class MatchmakingError extends ApplicationFailure {
    constructor(message: string, code: string, nonRetryable: boolean = true) {
        super(message, code, undefined, undefined, { nonRetryable });
    }
}

export class NoCapabilitiesMatchError extends MatchmakingError {
    constructor(specs: any) { super(`No nodes support specs: ${JSON.stringify(specs)}`, 'ERR_MATCH_NO_CAPABILITIES', true); }
}

export class NoSlaCompliantNodeError extends MatchmakingError {
    constructor(slaHours: number) { super(`No nodes can meet SLA of ${slaHours} hours`, 'ERR_MATCH_SLA_IMPOSSIBLE', false); }
}

export class NodeSelectionAmbiguousError extends MatchmakingError {
    constructor() { super(`Routing heuristics failed to generate a clear primary candidate`, 'ERR_MATCH_AMBIGUOUS_ROUTE', false); }
}
