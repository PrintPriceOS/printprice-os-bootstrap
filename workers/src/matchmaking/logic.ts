import { PrinterNodeCapabilities, MatchCandidate, RoutingDecision } from './types';
import { ManufacturingSpecs, CostModel } from '../pricing/types';
import * as Errors from './errors';
import * as Repository from './repository';

export async function rankAndSelectNodes(specs: ManufacturingSpecs, costModel: CostModel, blacklistNodes: string[]): Promise<RoutingDecision> {
    const allNodes = await Repository.getActivePrinterNodes();

    // 1. Hard Filtering (Capabilities)
    const capableNodes = allNodes.filter(node => {
        if (blacklistNodes.includes(node.nodeId)) return false;
        if (!node.supportedFormats.includes(specs.format)) return false;
        if (!node.supportedBindings.includes(specs.binding)) return false;
        if (specs.color_model === 'CMYK' && !node.hasColorCapacity) return false;
        return true;
    });

    if (capableNodes.length === 0) {
        throw new Errors.NoCapabilitiesMatchError(specs);
    }

    // 2. Scoring & Ranking
    const rankedCandidates: MatchCandidate[] = capableNodes.map(node => ({
        nodeId: node.nodeId,
        countryCode: node.countryCode,
        estimatedSlaHours: node.reputationScore > 90 ? 48 : 72,
        matchScore: node.reputationScore * 0.8 + (100 - costModel.total_manufacturing_cost) * 0.2 // basic heuristic
    })).sort((a, b) => b.matchScore - a.matchScore);

    if (rankedCandidates.length === 0 || rankedCandidates[0].matchScore < 40) {
        throw new Errors.NodeSelectionAmbiguousError();
    }

    return {
        jobId: 'pending',
        primaryCandidate: rankedCandidates[0],
        fallbackCandidates: rankedCandidates.slice(1, 4)
    };
}
