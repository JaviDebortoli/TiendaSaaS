import dotenv from 'dotenv';
import path from 'node:path';

// Repository-root `.env` first (npm workspaces run scripts from apps/server), then a local one.
dotenv.config({
  path: [
    path.join(process.cwd(), '../../.env'),
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '../../../.env'),
  ],
  quiet: true,
});

const missing: string[] = [];

// Required values are checked by `assertEnv()` at process start, not on import, so tooling that only
// loads the config (dashboard build, migrations tooling) works without a full environment.
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    missing.push(name);
    return '';
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function bool(name: string, fallback: boolean): boolean {
  const value = optional(name);
  return value === undefined ? fallback : value.toLowerCase() === 'true';
}

function list(name: string): string[] {
  return (optional(name) ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function assertEnv(): void {
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. See .env.example.`,
    );
  }
}

const appEnv = optional('APP_ENV') ?? 'prod';

export const env = {
  appEnv,
  isDev: appEnv === 'dev',
  port: Number(optional('PORT') ?? 3000),
  publicUrl: (optional('PUBLIC_URL') ?? 'http://localhost:3000').replace(/\/$/, ''),
  cookieSecret: required('COOKIE_SECRET'),
  corsOrigins: list('CORS_ORIGINS'),
  trustProxy: optional('TRUST_PROXY'),
  db: {
    host: required('DB_HOST'),
    port: Number(optional('DB_PORT') ?? 5432),
    name: required('DB_NAME'),
    username: required('DB_USERNAME'),
    password: required('DB_PASSWORD'),
    synchronize: bool('DB_SYNCHRONIZE', false),
  },
  superadmin: {
    username: required('SUPERADMIN_USERNAME'),
    password: required('SUPERADMIN_PASSWORD'),
  },
  s3: {
    endpoint: optional('S3_ENDPOINT'),
    bucket: required('S3_BUCKET'),
    accessKey: required('S3_ACCESS_KEY'),
    secretKey: required('S3_SECRET_KEY'),
    region: optional('S3_REGION') ?? 'us-east-1',
    forcePathStyle: bool('S3_FORCE_PATH_STYLE', true),
    assetUrlPrefix: optional('ASSET_URL_PREFIX'),
  },
  smtp: {
    host: optional('SMTP_HOST'),
    port: Number(optional('SMTP_PORT') ?? 587),
    user: optional('SMTP_USER'),
    password: optional('SMTP_PASSWORD'),
    from: optional('EMAIL_FROM') ?? 'Platform <no-reply@example.invalid>',
  },
};

export type Env = typeof env;
