import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'e2e/**/*.e2e-spec.ts'],
    typecheck: { tsconfig: './tsconfig.e2e.json' },
    testTimeout: 30000,
  },
  plugins: [
    // Vendure/NestJS rely on decorators and emitted metadata, which esbuild does not provide.
    swc.vite({
      jsc: { transform: { useDefineForClassFields: false } },
    }),
  ],
});
