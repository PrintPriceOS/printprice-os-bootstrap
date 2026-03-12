import { MatchCandidate } from './types';
import { TechnicalFindings } from '../preflight/types';
import { ManufacturingSpecs, CostModel } from '../pricing/types';
import { rankAndSelectNodes } from './logic';
import * as Errors from './errors';

export async function matchmakerActivity(
    jobId: string,
    costModel: CostModel,
    findings: TechnicalFindings,
    attempt: number,
    specs: ManufacturingSpecs,
    previouslyRejectedNodeIds: string[] = []
): Promise<MatchCandidate> {

    try {
        const routingDecision = await rankAndSelectNodes(specs, costModel, previouslyRejectedNodeIds);
        routingDecision.jobId = jobId;

        return routingDecision.primaryCandidate;
    } catch (error: any) {
        if (error instanceof Errors.MatchmakingError) {
            throw error;
        }
        throw new Errors.NodeSelectionAmbiguousError(); // Wrap generic errors
    }
}
