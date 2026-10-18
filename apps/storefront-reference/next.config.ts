import { loadEnvConfig } from '@next/env';
import path from 'node:path';
import type { NextConfig } from 'next';

// One place for settings: the repository's `.env` (the server uses it too). In containers the
// environment is injected and there is no file, which is fine.
const repositoryRoot = path.resolve(import.meta.dirname, '../..');
// forceReload: Next already loaded the env of this folder before reading this file.
loadEnvConfig(repositoryRoot, process.env.NODE_ENV !== 'production', console, true);

const config: NextConfig = {
  // Self-contained server output for the Docker image.
  output: 'standalone',
  // The workspace package ships ESM; let Next compile it with the app.
  transpilePackages: ['@tiendasaas/commerce-core'],
  // Lets the standalone output include files from the monorepo root.
  outputFileTracingRoot: repositoryRoot,
  poweredByHeader: false,
};

export default config;
