import { bootstrapWorker } from '@vendure/core';
import { assertEnv } from './env';
import { config } from './vendure-config';

assertEnv();

bootstrapWorker(config)
  .then(async (worker) => {
    await worker.startJobQueue();
    await worker.startHealthCheckServer({ port: Number(process.env.WORKER_HEALTH_PORT ?? 3020) });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
