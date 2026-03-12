import { JobStratifier } from './stratifier';
import { CandidateReconstructor } from './reconstructor';
import { PolicyRunner } from './policyRunner';
import { Reporter } from './reporter';
import * as dotenv from 'dotenv';

dotenv.config();

async function runSimulation() {
    const isSmoke = process.argv.includes('--smoke');
    const sampleSize = isSmoke ? 100 : 1000;

    const stratifier = new JobStratifier();
    const reconstructor = new CandidateReconstructor();
    const runner = new PolicyRunner();
    const reporter = new Reporter();

    console.log(`--- [Phase 17.A] PPOS Economic ${isSmoke ? 'SMOKE' : 'FULL'} Simulation ---`);
    console.log(`Target Sample: ${sampleSize} jobs`);

    try {
        const sample = await stratifier.extractStratifiedSample('seed_calibration_v1');
        const limitedSample = sample.slice(0, sampleSize);

        for (const job of limitedSample) {
            process.stdout.write('.'); // Simple progress indicator

            const pool = await reconstructor.reconstructPool(job);

            if (pool.length === 0) {
                // Log uncertainty but continue simulation
                continue;
            }

            const baseline = runner.runBaseline(job, pool);
            const economics = runner.runEconomicsV1(job, pool);

            reporter.record(job, baseline, economics);
        }

        console.log('\nSimulation complete.');
        await reporter.generate('./reports/calibration_results.md');

    } catch (error) {
        console.error('\n[Simulator Error]', error);
        process.exit(1);
    }
}

runSimulation().catch(console.error);
