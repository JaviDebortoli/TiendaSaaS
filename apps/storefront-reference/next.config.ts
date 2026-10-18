import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  // Self-contained server output for the Docker image.
  output: 'standalone',
  // The workspace package ships ESM; let Next compile it with the app.
  transpilePackages: ['@tiendasaas/commerce-core'],
  // Lets the standalone output include files from the monorepo root.
  outputFileTracingRoot: path.resolve(import.meta.dirname, '../..'),
  poweredByHeader: false,
};

export default config;
