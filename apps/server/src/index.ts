import { bootstrap, runMigrations } from '@vendure/core';
import { assertEnv } from './env';
import { config } from './vendure-config';

assertEnv();

// The server owns migrations. The worker never runs them (see index-worker.ts).
runMigrations(config)
  .then(() => bootstrap(config))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
