import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'e2e/**/*.e2e-spec.ts'],
    testTimeout: 30000,
  },
  // The integration suite boots a real Vendure server, which needs decorator metadata.
  plugins: [swc.vite({ jsc: { transform: { useDefineForClassFields: false } } })],
});
