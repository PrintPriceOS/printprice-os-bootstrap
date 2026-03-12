import { db } from './db';

// Required by temporal to uniquely identify the job states
export enum GlobalJobState {
    INGESTED = 'INGESTED',
    PREFLIGHTING = 'PREFLIGHTING',
    PRICING = 'PRICING',
    MATCHMAKING = 'MATCHMAKING',
    DISPATCHED = 'DISPATCHED',
    NODE_ACCEPTED = 'NODE_ACCEPTED',
    IN_PRODUCTION = 'IN_PRODUCTION',
    SHIPPED = 'SHIPPED',
    FAILED_MATCHMAKING = 'FAILED_MATCHMAKING',
    REFUNDED = 'REFUNDED'
}

import { Context } from '@temporalio/activity';

export async function updateJobRegistryActivity(
    jobId: string,
    traceId: string,
    newState: GlobalJobState,
    expectedPreviousState: GlobalJobState | null,
    triggerActivity: string,
    payload: any = {}
): Promise<void> {
    const connection = await db.getConnection();
    const context = Context.current();

    try {
        await connection.beginTransaction();

        const workflowId = context.info.workflowId;
        const workflowRunId = context.info.runId;

        if (expectedPreviousState) {
            await connection.execute(
                `UPDATE canonical_job_registry 
                 SET current_stage = ?, updated_at = NOW(3), workflow_id = ?, workflow_run_id = ?
                 WHERE job_id = ? AND current_stage = ?`,
                [newState, workflowId, workflowRunId, jobId, expectedPreviousState]
            );
        } else {
            await connection.execute(
                `INSERT INTO canonical_job_registry (job_id, current_stage, trace_id, workflow_id, workflow_run_id, sla_deadline)
                 VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(3), INTERVAL 7 DAY))
                 ON DUPLICATE KEY UPDATE current_stage = ?, workflow_id = ?, workflow_run_id = ?`,
                [jobId, newState, traceId, workflowId, workflowRunId, newState, workflowId, workflowRunId]
            );
        }

        await connection.execute(
            `INSERT INTO job_events_ledger (event_id, job_id, previous_stage, new_stage, trigger_activity, trace_id, event_payload)
             VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
            [jobId, expectedPreviousState, newState, triggerActivity, traceId, JSON.stringify(payload)]
        );

        await connection.commit();
    } catch (err) {
        if (connection) await connection.rollback();
        throw err;
    } finally {
        if (connection) connection.release();
    }
}

export async function preflightActivity(jobId: string, assetUrl: string): Promise<any> {
    console.log(`[Preflight] Processing ${jobId} for ${assetUrl}`);
    return { status: 'ok', pages: 100 };
}

export async function pricingActivity(jobId: string, findings: any, specs: any): Promise<any> {
    console.log(`[Pricing] Calculating price for ${jobId}`);
    return { price: 15.50, margin: 0.20 };
}

import { rankAndSelectNodes, getActivePrinterNodes } from './matchmaking';
import { ShadowPolicyEngine } from './matchmaking/ShadowPolicyEngine';
import { ShadowLoggingService } from './matchmaking/ShadowLoggingService';

export async function matchmakerActivity(jobId: string, pricing: any, findings: any, attempt: number): Promise<any> {
    console.log(`[Matchmaking] Attempt ${attempt} for ${jobId}`);

    const shadowEngine = new ShadowPolicyEngine();
    const shadowLogger = new ShadowLoggingService();
    const traceId = Context.current().info.workflowId;

    try {
        // 1. Synchronized Candidate Pool
        const specs = findings.specs || {};
        const costModel = pricing.costModel || { total_manufacturing_cost: 0, total_price: pricing.price || 0 };
        if (!specs.target_country) specs.target_country = 'ES';

        const allActiveNodes = await getActivePrinterNodes();
        // Technical filtering synchronization
        const capableNodes = allActiveNodes.filter(node =>
            node.supportedFormats.includes(specs.format || 'A4') &&
            node.supportedBindings.includes(specs.binding || 'perfect')
        );

        if (capableNodes.length === 0) {
            throw new Error('NO_TECHNICAL_CANDIDATES');
        }

        // 2. Baseline Decision
        const baselineDecision = await rankAndSelectNodes(specs, costModel, []);
        const primaryNode = baselineDecision.primaryCandidate;
        const baselineDistance = specs.target_country === primaryNode.countryCode ? 150 : 1200;

        // 3. Shadow Policy Calculation
        let shadowResult;
        let shadowError;
        const shadowStart = Date.now();

        try {
            const [jobRows]: any = await db.execute(
                'SELECT customer_tier FROM canonical_job_registry WHERE job_id = ?',
                [jobId]
            );
            const tier = jobRows[0]?.customer_tier || 'STANDARD';

            shadowResult = await shadowEngine.calculateShadowDecision(
                specs,
                costModel,
                capableNodes, // Shared pool
                tier as any
            );
        } catch (err: any) {
            shadowError = err.message || 'UNKNOWN_SHADOW_ERROR';
            console.error(`[ShadowMode] Logic error for ${jobId}:`, err);
        }

        const shadowRuntime = Date.now() - shadowStart;

        // 4. Persistence with Trace ID Audit
        const [jobMeta]: any = await db.execute('SELECT customer_tier FROM canonical_job_registry WHERE job_id = ?', [jobId]);

        await shadowLogger.logShadowDecision({
            jobId,
            traceId, // Hardened coupling
            tier: jobMeta[0]?.customer_tier || 'STANDARD',
            candidateCount: capableNodes.length,
            baselineNodeId: primaryNode.nodeId,
            baselineMfgCost: costModel.total_manufacturing_cost,
            baselineDistanceKm: baselineDistance,
            runtimeMs: shadowRuntime,
            errorCode: shadowError
        }, shadowResult);

        return { id: primaryNode.nodeId };

    } catch (err: any) {
        console.error(`[Matchmaking] Fatal Error in Stage 1:`, err);
        throw err;
    }
}

export async function dispatchToNodeActivity(jobId: string, nodeId: string): Promise<void> {
    console.log(`[Dispatch] Initiating dispatch for ${jobId} to node ${nodeId}`);

    const connection = await db.getConnection();
    try {
        // 1. Fetch Node Webhook URL and metadata
        const [rows]: any = await connection.execute(
            'SELECT webhook_url, trace_id FROM printer_nodes WHERE node_id = ?',
            [nodeId]
        );

        if (!rows || rows.length === 0 || !rows[0].webhook_url) {
            throw new Error(`DISPATCH_FAILURE: Node ${nodeId} has no configured webhook URL`);
        }

        const { webhook_url } = rows[0];

        // 2. Fetch Job Metadata for Payload
        const [jobRows]: any = await connection.execute(
            'SELECT trace_id FROM canonical_job_registry WHERE job_id = ?',
            [jobId]
        );
        const traceId = jobRows[0]?.trace_id || 'unknown';

        // 3. Perform HTTP Dispatch (FEP Protocol Section 3)
        // In a real environment, we'd use axios with mTLS certificates
        const dispatchPayload = {
            global_job_id: jobId,
            trace_id: traceId,
            production_specs: {
                // Mock specs - in production these come from the pricing/preflight findings
                format: 'A4',
                pages: 100,
                quantity: 1,
            },
            pdf_asset_url: `https://storage.printprice.os/jobs/${jobId}.pdf`,
            manufacturing_deadline: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
            pricing_context: {
                node_payout_amount: 10.00,
                currency: 'USD'
            }
        };

        const response = await fetch(`${webhook_url}/dispatch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dispatchPayload)
        });

        if (!response.ok) {
            throw new Error(`NODE_REJECTED: Node ${nodeId} returned ${response.status}`);
        }

        console.log(`[Dispatch] Job ${jobId} successfully acknowledged by ${nodeId}`);
    } catch (err: any) {
        console.error(`[Dispatch Error] ${err.message}`);
        throw err; // Temporal will handle retry/compensation
    } finally {
        connection.release();
    }
}

export async function refundPaymentActivity(jobId: string): Promise<void> {
    console.log(`[Compensation] Refunding payment for ${jobId}`);
}
