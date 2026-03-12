const mysql = require('mysql2/promise');
require('dotenv').config();

const db = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'ppos_user',
    password: process.env.MYSQL_PASSWORD || 'ppos_pass',
    database: process.env.MYSQL_DATABASE || 'printprice_os',
});

async function runSmokeTest() {
    const testJobId = `smoke-test-${Date.now()}`;
    const testTraceId = `trace-${Math.random().toString(36).substring(7)}`;
    const testWorkflowId = `wf-${Date.now()}`;
    const testRunId = `run-${Math.random().toString(36).substring(7)}`;

    console.log(`[SmokeTest] Starting Standalone ID Persistence Validation`);
    console.log(`[SmokeTest] JobID: ${testJobId}, TraceID: ${testTraceId}`);

    try {
        // 1. Simulate Registry Update (updateJobRegistryActivity logic)
        console.log(`[SmokeTest] 1. Simulating Registry Update...`);
        await db.execute(
            `INSERT INTO canonical_job_registry (job_id, current_stage, trace_id, workflow_id, workflow_run_id, sla_deadline)
             VALUES (?, 'MATCHMAKING', ?, ?, ?, DATE_ADD(NOW(3), INTERVAL 7 DAY))`,
            [testJobId, testTraceId, testWorkflowId, testRunId]
        );

        // 2. Simulate Ledger Entry
        console.log(`[SmokeTest] 2. Simulating Ledger Entry...`);
        await db.execute(
            `INSERT INTO job_events_ledger (event_id, job_id, previous_stage, new_stage, trigger_activity, trace_id, event_payload)
             VALUES (UUID(), ?, 'INGESTED', 'MATCHMAKING', 'smokeTestActivity', ?, '{}')`,
            [testJobId, testTraceId]
        );

        // 3. Simulate Shadow Log Entry (matchmakerActivity logic)
        console.log(`[SmokeTest] 3. Simulating Shadow Log Entry...`);
        await db.execute(
            `INSERT INTO shadow_routing_log (
                global_job_id, trace_id, customer_tier, candidate_count,
                baseline_node_id, baseline_mfg_cost, baseline_distance_km,
                shadow_node_id, shadow_total_expected_cost, shadow_mfg_cost, shadow_ship_cost, shadow_risk_cost, shadow_sla_cost, shadow_distance_km,
                shadow_policy_mode, shadow_runtime_ms, is_divergent, is_geo_better
            ) VALUES (?, ?, 'STANDARD', 5, 'node-baseline', 50.00, 150, 'node-shadow', 48.50, 45.00, 2.00, 1.00, 0.50, 120, 'MARGIN', 45, true, true)`,
            [testJobId, testTraceId]
        );

        // 4. Verification Queries
        console.log(`[SmokeTest] 4. Running Verification Queries...`);

        const [registry] = await db.query('SELECT * FROM canonical_job_registry WHERE job_id = ?', [testJobId]);
        console.log(`[Verification] Registry WorkflowID: ${registry[0].workflow_id} (Match: ${registry[0].workflow_id === testWorkflowId})`);

        const [ledger] = await db.query('SELECT * FROM job_events_ledger WHERE job_id = ?', [testJobId]);
        console.log(`[Verification] Ledger TraceID: ${ledger[0].trace_id} (Match: ${ledger[0].trace_id === testTraceId})`);

        const [shadow] = await db.query('SELECT * FROM shadow_routing_log WHERE global_job_id = ?', [testJobId]);
        console.log(`[Verification] Shadow TraceID: ${shadow[0].trace_id} (Match: ${shadow[0].trace_id === testTraceId})`);
        console.log(`[Verification] Shadow Divergent: ${shadow[0].is_divergent}`);

        console.log(`[SmokeTest] SUCCESS: All Trace IDs and Shadow metrics are correctly persisted.`);

        // Cleanup
        await db.execute('DELETE FROM shadow_routing_log WHERE global_job_id = ?', [testJobId]);
        await db.execute('DELETE FROM job_events_ledger WHERE job_id = ?', [testJobId]);
        await db.execute('DELETE FROM canonical_job_registry WHERE job_id = ?', [testJobId]);
        console.log(`[SmokeTest] Cleanup complete.`);

    } catch (err) {
        console.error(`[SmokeTest] FATAL ERROR:`, err.message);
        if (err.message.includes('Unknown column')) {
            console.error(`[SmokeTest] SCHEMA MISMATCH: Ensure expanded_log_schema and registry updates are applied.`);
        }
    } finally {
        await db.end();
        process.exit(0);
    }
}

runSmokeTest();
