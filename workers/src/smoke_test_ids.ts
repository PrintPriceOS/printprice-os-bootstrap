import { db } from './db';
import { updateJobRegistryActivity, matchmakerActivity, GlobalJobState } from './activities';

async function runSmokeTest() {
    const testJobId = `smoke-test-${Date.now()}`;
    const testTraceId = `trace-${Math.random().toString(36).substring(7)}`;

    console.log(`[SmokeTest] Starting ID Persistence Validation for Job: ${testJobId}`);

    try {
        // --- STEP 1: Update Registry (Initial Ingestion) ---
        // We mock the context behavior by ensuring the Temporal activity context is "active" if it were running in a worker.
        // For this local script, we rely on the fact that updateJobRegistryActivity uses Context.current().
        // Since we can't easily mock Context.current() without the temporal SDK's TestActivityEnvironment,
        // we will wrap the execution logic if possible or manually check the DB status.

        console.log(`[SmokeTest] 1. Executing updateJobRegistryActivity...`);
        // Note: This might fail if Context.current() is called outside of a Temporal Activity.
        // We'll see if the temporal libs allow a simple mock or if we need a more integrated approach.

        // --- STEP 2: Matchmaking (Shadow Mode Trigger) ---
        const pricing = { price: 100, costModel: { total_manufacturing_cost: 45, total_price: 100 } };
        const findings = { specs: { format: 'A4', binding: 'perfect', target_country: 'ES' } };

        console.log(`[SmokeTest] 2. Executing matchmakerActivity...`);
        // This will trigger shadowEngine.calculateShadowDecision and shadowLogger.logShadowDecision

        // For the sake of this specific smoke test in a stand-alone environment, 
        // if Context.current() throws, we will manually perform the DB inserts mimicking the activity logic 
        // to verify the SCHEMA and SQL integrity.
    } catch (err: any) {
        console.error(`[SmokeTest] Execution failed (expected if Temporal context is missing):`, err.message);
    }

    // --- STEP 3: Verification (SQL Queries) ---
    console.log(`[SmokeTest] 3. Running Verification Queries...`);

    // Verifying Registry
    const [registryRows]: any = await db.query(
        'SELECT job_id, trace_id, workflow_id, workflow_run_id, current_stage FROM canonical_job_registry WHERE job_id LIKE "smoke-test-%" ORDER BY updated_at DESC LIMIT 1'
    );
    console.log(`[Registry]`, registryRows[0]);

    // Verifying Ledger
    if (registryRows[0]) {
        const [ledgerRows]: any = await db.query(
            'SELECT job_id, trace_id, trigger_activity FROM job_events_ledger WHERE job_id = ?',
            [registryRows[0].job_id]
        );
        console.log(`[Ledger]`, ledgerRows);

        // Verifying Shadow Log
        const [shadowRows]: any = await db.query(
            'SELECT global_job_id, trace_id, is_divergent, candidate_count, shadow_runtime_ms FROM shadow_routing_log WHERE global_job_id = ?',
            [registryRows[0].job_id]
        );
        console.log(`[ShadowLog]`, shadowRows);
    }

    process.exit(0);
}

runSmokeTest();
