import { UuidIdStrategy } from '@vendure/core';
import { beforeAll, describe, expect, it } from 'vitest';

describe('vendure config', () => {
  let config: typeof import('./vendure-config').config;

  beforeAll(async () => {
    Object.assign(process.env, {
      APP_ENV: 'prod',
      COOKIE_SECRET: 'test-cookie-secret',
      DB_HOST: 'localhost',
      DB_NAME: 'test',
      DB_USERNAME: 'test',
      DB_PASSWORD: 'test',
      SUPERADMIN_USERNAME: 'admin-from-env',
      SUPERADMIN_PASSWORD: 'password-from-env',
      S3_BUCKET: 'bucket',
      S3_ACCESS_KEY: 'key',
      S3_SECRET_KEY: 'secret',
      CORS_ORIGINS: 'https://admin.example.test, https://other.example.test',
    });
    ({ config } = await import('./vendure-config'));
  });

  it('uses PostgreSQL with migrations only', () => {
    expect(config.dbConnectionOptions.type).toBe('postgres');
    expect(config.dbConnectionOptions.synchronize).toBe(false);
  });

  it('uses UUID entity ids', () => {
    expect(config.entityOptions?.entityIdStrategy).toBeInstanceOf(UuidIdStrategy);
  });

  it('takes superadmin credentials from the environment, never the factory defaults', () => {
    expect(config.authOptions.superadminCredentials).toEqual({
      identifier: 'admin-from-env',
      password: 'password-from-env',
    });
  });

  it('restricts CORS to the configured origins in production', () => {
    expect(config.apiOptions.cors).toMatchObject({
      origin: ['https://admin.example.test', 'https://other.example.test'],
    });
  });
});
