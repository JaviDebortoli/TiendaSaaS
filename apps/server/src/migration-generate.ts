import { generateMigration } from '@vendure/core';
import path from 'node:path';
import { assertEnv } from './env';
import { config } from './vendure-config';

assertEnv();

// Usage: npm run migration:generate -w @tiendasaas/server -- <migration-name>
const name = process.argv[2];
if (!name) {
  console.error('Usage: npm run migration:generate -w @tiendasaas/server -- <migration-name>');
  process.exit(1);
}

generateMigration(config, { name, outputDir: path.join(__dirname, 'migrations') })
  .then((file) => {
    console.log(file ? `Created migration: ${file}` : 'No schema changes detected.');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
