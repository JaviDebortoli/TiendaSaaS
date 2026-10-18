import { defineConfig } from 'tsup';

// ESM with types: storefronts are modern, and this code may run in the browser (PRD 16.2).
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  platform: 'neutral',
});
