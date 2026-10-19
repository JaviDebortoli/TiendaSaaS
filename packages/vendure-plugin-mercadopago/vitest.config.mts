import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'e2e/**/*.e2e-spec.ts'],
    typecheck: { tsconfig: './tsconfig.e2e.json' },
    testTimeout: 30000,
    // The PostgreSQL specs share one database (Vendure names it after test-env.ts), so two of them
    // starting together collide when creating it. Without PostgreSQL nothing shares state.
    fileParallelism: !process.env.TEST_DB_PASSWORD,
  },
  plugins: [
    // Vendure/NestJS rely on decorators and emitted metadata, which esbuild does not provide.
    swc.vite({
      jsc: { transform: { useDefineForClassFields: false } },
    }),
  ],
});
