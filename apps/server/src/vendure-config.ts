import { AssetServerPlugin, configureS3AssetStorage } from '@vendure/asset-server-plugin';
import {
  DefaultJobQueuePlugin,
  DefaultSchedulerPlugin,
  DefaultSearchPlugin,
  UuidIdStrategy,
  VendureConfig,
} from '@vendure/core';
import { DashboardPlugin } from '@vendure/dashboard/plugin';
import { GraphiqlPlugin } from '@vendure/graphiql-plugin';
import { HardenPlugin } from '@vendure/harden-plugin';
import path from 'node:path';
import { MercadoPagoPlugin } from 'vendure-plugin-mercadopago';
import { createEmailPlugin } from './email/email-plugin';
import { env } from './env';
import { PlatformPlugin } from './platform/platform.plugin';

function parseTrustProxy(value: string | undefined): boolean | number {
  if (value === undefined) return false;
  if (value === 'true') return true;
  const hops = Number(value);
  return Number.isInteger(hops) ? hops : false;
}

export const config: VendureConfig = {
  apiOptions: {
    port: env.port,
    adminApiPath: 'admin-api',
    shopApiPath: 'shop-api',
    csrfPrevention: true,
    trustProxy: parseTrustProxy(env.trustProxy),
    // Storefronts call the Shop API from their own server, so CORS only has to cover the dashboard
    // (same origin) plus anything listed explicitly. In dev any origin is reflected.
    cors: {
      origin: env.isDev && env.corsOrigins.length === 0 ? true : env.corsOrigins,
      credentials: true,
    },
  },
  authOptions: {
    tokenMethod: ['bearer', 'cookie'],
    superadminCredentials: {
      identifier: env.superadmin.username,
      password: env.superadmin.password,
    },
    cookieOptions: { secret: env.cookieSecret },
  },
  dbConnectionOptions: {
    type: 'postgres',
    host: env.db.host,
    port: env.db.port,
    database: env.db.name,
    username: env.db.username,
    password: env.db.password,
    // Production uses migrations only. `DB_SYNCHRONIZE=true` is a local/test convenience.
    synchronize: env.db.synchronize,
    migrations: [path.join(__dirname, './migrations/*.+(js|ts)')],
    logging: false,
    // Store timestamps in UTC regardless of the server time zone.
    extra: { options: '-c timezone=UTC' },
  },
  // UUIDs keep sequential ids from revealing how many records exist. Must be set before loading data.
  entityOptions: { entityIdStrategy: new UuidIdStrategy() },
  paymentOptions: {
    // The Mercado Pago handler is registered by its plugin.
    paymentMethodHandlers: [],
  },
  customFields: {},
  plugins: [
    ...(env.isDev ? [GraphiqlPlugin.init()] : []),
    AssetServerPlugin.init({
      route: 'assets',
      assetUploadDir: path.join(__dirname, '../static/assets'),
      assetUrlPrefix: env.s3.assetUrlPrefix ?? `${env.publicUrl}/assets/`,
      storageStrategyFactory: configureS3AssetStorage({
        bucket: env.s3.bucket,
        credentials: {
          accessKeyId: env.s3.accessKey,
          secretAccessKey: env.s3.secretKey,
        },
        nativeS3Configuration: {
          endpoint: env.s3.endpoint,
          region: env.s3.region,
          forcePathStyle: env.s3.forcePathStyle,
        },
      }),
    }),
    DefaultSchedulerPlugin.init(),
    DefaultJobQueuePlugin.init({
      useDatabaseForBuffer: true,
      pollInterval: 1000,
      // Webhook jobs are retried with growing delays: 5s, 10s, 20s, ... capped at 5 minutes.
      backoffStrategy: (_queue, attempt) => Math.min(5000 * 2 ** (attempt - 1), 300_000),
    }),
    DefaultSearchPlugin.init({ bufferUpdates: false, indexStockStatus: true }),
    PlatformPlugin.init(),
    MercadoPagoPlugin.init({ ...env.mercadoPago, publicUrl: env.publicUrl }),
    HardenPlugin.init({
      maxQueryComplexity: 500,
      apiMode: env.isDev ? 'dev' : 'prod',
    }),
    createEmailPlugin({
      platform: { name: env.platformName, from: env.smtp.from, publicUrl: env.publicUrl },
      delivery:
        env.isDev || !env.smtp.host
          ? {
              devMode: true,
              outputPath: path.join(__dirname, '../static/email/test-emails'),
              route: 'mailbox',
            }
          : {
              transport: {
                type: 'smtp',
                host: env.smtp.host,
                port: env.smtp.port,
                auth: env.smtp.user
                  ? { user: env.smtp.user, pass: env.smtp.password ?? '' }
                  : undefined,
              },
            },
    }),
    DashboardPlugin.init({
      route: 'dashboard',
      // Output of `npm run build:dashboard`; resolves the same from src/ (dev) and dist/ (prod).
      appDir: path.join(__dirname, '../dist/dashboard'),
    }),
  ],
};
