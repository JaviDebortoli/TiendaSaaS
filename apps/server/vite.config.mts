import { vendureDashboardPlugin } from '@vendure/dashboard/vite';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/dashboard',
  build: {
    outDir: join(__dirname, 'dist/dashboard'),
  },
  plugins: [
    vendureDashboardPlugin({
      vendureConfigPath: pathToFileURL('./src/vendure-config.ts'),
      // In production 'auto' derives the API URL from the server that serves the dashboard.
      api:
        process.env.NODE_ENV === 'production'
          ? { host: 'auto', port: 'auto' }
          : { host: 'http://localhost', port: 3000 },
      gqlOutputPath: './src/gql',
    }),
  ],
  resolve: {
    alias: {
      '@/gql': resolve(__dirname, './src/gql/graphql.ts'),
    },
  },
});
