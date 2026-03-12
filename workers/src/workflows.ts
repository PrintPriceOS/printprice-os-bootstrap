import { proxyActivities, defineSignal, setHandler, condition, sleep } from '@temporalio/workflow';
import type * as activities from './activities';
import { GlobalJobState } from './activities';

const {
    preflightActivity, pricingActivity, matchmakerActivity, dispatchToNodeActivity,
    refundPaymentActivity, updateJobRegistryActivity
} = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute',
    retry: {
        maximumAttempts: 5,
        initialInterval: '2 seconds',
        backoffCoefficient: 2,
        maximumInterval: '1 minute',
        nonRetryableErrorTypes: ['PdfCorruptedError', 'NegativeMarginError']
    }
});

// Printer Node Signals
export const nodeAcceptedSignal = defineSignal<{ nodeId: string }>('NODE_ACCEPTED');
export const nodeRejectedSignal = defineSignal<{ nodeId: string, reason: string }>('NODE_REJECTED');
export const nodeInPressSignal = defineSignal<{ nodeId: string }>('NODE_IN_PRESS');
export const nodeShippedSignal = defineSignal<{ trackingCode: string }>('NODE_SHIPPED');

export async function GlobalJobWorkflow(jobId: string, traceId: string, assetUrl: string, specs: any): Promise<void> {
    let isAccepted = false;
    let isRejected = false;
    let isInPress = false;
    let isShipped = false;
    let activeNodeId: string | null = null;

    setHandler(nodeAcceptedSignal, ({ nodeId }) => { isAccepted = true; activeNodeId = nodeId; });
    setHandler(nodeRejectedSignal, () => { isRejected = true; });
    setHandler(nodeInPressSignal, () => { isInPress = true; });
    setHandler(nodeShippedSignal, () => { isShipped = true; });

    async function syncState(newState: GlobalJobState, expectedPrevious?: GlobalJobState, failureContext?: any) {
        await updateJobRegistryActivity(jobId, traceId, newState, expectedPrevious || null, 'WorkflowTransition', failureContext);
    }

    try {
        // 1. PREFLIGHT
        await syncState(GlobalJobState.PREFLIGHTING, GlobalJobState.INGESTED);
        const findings = await preflightActivity(jobId, assetUrl);

        // 2. PRICING
        await syncState(GlobalJobState.PRICING, GlobalJobState.PREFLIGHTING);
        const pricing = await pricingActivity(jobId, findings, specs);

        // 3. MATCHMAKING
        let matchAttempts = 0;
        while (!isAccepted && matchAttempts < 3) {
            await syncState(GlobalJobState.MATCHMAKING, undefined); // Undefined previous to allow loop
            const node = await matchmakerActivity(jobId, pricing, findings, matchAttempts);

            await syncState(GlobalJobState.DISPATCHED, GlobalJobState.MATCHMAKING);
            await dispatchToNodeActivity(jobId, node.id);

            // Await Handshake
            const responded = await condition(() => isAccepted || isRejected, '4 hours');
            if (!responded || isRejected) {
                matchAttempts++;
                isRejected = false;
                continue;
            }
        }

        if (!isAccepted) throw new Error('MATCHMAKER_EXHAUSTED');
        await syncState(GlobalJobState.NODE_ACCEPTED, GlobalJobState.DISPATCHED);

        // 4. PRODUCTION
        const inPress = await condition(() => isInPress, '48 hours');
        if (!inPress) {
            throw new Error('NODE_PRODUCTION_TIMEOUT');
        }
        await syncState(GlobalJobState.IN_PRODUCTION, GlobalJobState.NODE_ACCEPTED);

        // 5. FULFILLMENT
        const shipped = await condition(() => isShipped, '14 days');
        if (!shipped) {
            throw new Error('NODE_SHIPPING_TIMEOUT');
        }
        await syncState(GlobalJobState.SHIPPED, GlobalJobState.IN_PRODUCTION);

    } catch (err: any) {
        const errorType = err.name || err.message;

        // Compensation Matrix
        if (errorType === 'PdfCorruptedError') {
            await syncState(GlobalJobState.FAILED_PREFLIGHT, undefined, err);
            // No refund needed, payment intent cancelled transparently
            await syncState(GlobalJobState.CANCELLED);
        }
        else if (errorType === 'NegativeMarginError') {
            await syncState(GlobalJobState.FAILED_PRICING, undefined, err);
            await syncState(GlobalJobState.MANUAL_REVIEW);
        }
        else if (errorType === 'MATCHMAKER_EXHAUSTED' || errorType === 'NODE_PRODUCTION_TIMEOUT') {
            await syncState(GlobalJobState.FAILED_MATCHMAKING, undefined, err);
            await refundPaymentActivity(jobId);
            await syncState(GlobalJobState.REFUNDED);
        }
        else {
            // Unhandled fatal error
            await syncState(GlobalJobState.MANUAL_REVIEW, undefined, err);
        }

        throw err; // Fail Temporal Workflow
    }
}
