import { Worker } from '@temporalio/worker';
import * as activities from './activities';

async function run() {
    const worker = await Worker.create({
        workflowsPath: require.resolve('./workflows'),
        activities,
        taskQueue: 'printprice-jobs',
        connectionOptions: {
            address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
        },
    });

    console.log('Worker listening on task queue: printprice-jobs');
    await worker.run();
}

run().catch((err) => {
    console.error('Worker failed to start', err);
    process.exit(1);
});
