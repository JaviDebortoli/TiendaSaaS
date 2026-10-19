import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  accountAccessContext,
  accountRefreshContext,
  TokenCipher,
} from 'vendure-plugin-mercadopago';
import { Init1792351675476 } from '../src/migrations/1792351675476-init';
import { Mercadopago1792354373861 } from '../src/migrations/1792354373861-mercadopago';
import { Platform1792354900631 } from '../src/migrations/1792354900631-platform';
import { MpAccountLinks1792373803784 } from '../src/migrations/1792373803784-mp-account-links';
import { MpPreferenceRegistry1792379793083 } from '../src/migrations/1792379793083-mp-preference-registry';

/**
 * Runs the migration that splits `mercado_pago_connection` into accounts and links on a
 * PostgreSQL database holding data of the previous version (PRD 16.4). Needs a database: set
 * TEST_DB_PASSWORD (and optionally TEST_DB_HOST, TEST_DB_PORT, TEST_DB_USERNAME). CI always does.
 */
const suite = process.env.TEST_DB_PASSWORD ? describe : describe.skip;

const KEY = randomBytes(32).toString('base64');
const cipher = new TokenCipher(KEY);

const legacyAccess = (channelId: string) => `mp-connection:${channelId}:access`;
const legacyRefresh = (channelId: string) => `mp-connection:${channelId}:refresh`;

const connectionOptions = (database: string) =>
  ({
    type: 'postgres',
    host: process.env.TEST_DB_HOST ?? 'localhost',
    port: Number(process.env.TEST_DB_PORT ?? 5432),
    username: process.env.TEST_DB_USERNAME ?? 'tiendasaas',
    password: process.env.TEST_DB_PASSWORD,
    database,
    extra: { options: '-c timezone=UTC' },
  }) as const;

suite('migration: accounts and channel links (PRD 9.3)', () => {
  const databases: string[] = [];
  let admin: DataSource;

  beforeAll(async () => {
    admin = await new DataSource(connectionOptions('postgres')).initialize();
  });

  afterAll(async () => {
    for (const name of databases)
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.destroy();
  });

  /** A database migrated up to the previous version, with its own name. */
  async function previousVersion() {
    const name = `mig_${randomBytes(4).toString('hex')}`;
    databases.push(name);
    await admin.query(`CREATE DATABASE "${name}"`);
    const legacy = await new DataSource({
      ...connectionOptions(name),
      migrations: [Init1792351675476, Mercadopago1792354373861, Platform1792354900631],
    }).initialize();
    await legacy.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await legacy.runMigrations();
    return { name, legacy };
  }

  /** The database after the account migration and the preference registry migration. */
  const upgradeWithRegistry = (name: string) =>
    new DataSource({
      ...connectionOptions(name),
      migrations: [
        Init1792351675476,
        Mercadopago1792354373861,
        Platform1792354900631,
        MpAccountLinks1792373803784,
        MpPreferenceRegistry1792379793083,
      ],
    }).initialize();

  const upgradeSource = (name: string) =>
    new DataSource({
      ...connectionOptions(name),
      migrations: [
        Init1792351675476,
        Mercadopago1792354373861,
        Platform1792354900631,
        MpAccountLinks1792373803784,
      ],
    }).initialize();

  async function insert(db: DataSource, sql: string, params: unknown[] = []): Promise<string> {
    const [row] = await db.query(`${sql} RETURNING id`, params);
    return row.id as string;
  }

  /** A store with an order placed in it, like the application leaves it. */
  async function seedStore(db: DataSource, code: string, defaultChannelId: string) {
    const channelId = await insert(
      db,
      `INSERT INTO channel (code, token, "defaultLanguageCode", "defaultCurrencyCode", "pricesIncludeTax")
       VALUES ($1, $2, 'en', 'ARS', true)`,
      [code, `${code}-token`],
    );
    const orderId = await insert(
      db,
      `INSERT INTO "order" (code, state, "couponCodes", "shippingAddress", "billingAddress", "currencyCode", "subTotal", "subTotalWithTax")
       VALUES ($1, 'PaymentSettled', '', '{}', '{}', 'ARS', 1000, 1000)`,
      [`ORDER-${code}`],
    );
    // Orders belong to the default channel and to the store's own.
    for (const id of [defaultChannelId, channelId]) {
      await db.query(
        `INSERT INTO order_channels_channel ("orderId", "channelId") VALUES ($1, $2)`,
        [orderId, id],
      );
    }
    return { channelId, orderId };
  }

  const payment = (db: DataSource, orderId: string, method: string, metadata: object) =>
    insert(
      db,
      `INSERT INTO payment (method, state, metadata, amount, "orderId") VALUES ($1, 'Settled', $2, 1000, $3)`,
      [method, JSON.stringify(metadata), orderId],
    );

  const connection = (
    db: DataSource,
    channelId: string,
    mpUserId: string,
    overrides: { status?: string; tokens?: boolean; lastError?: string } = {},
  ) =>
    db.query(
      `INSERT INTO mercado_pago_connection ("createdAt", "channelId", "mpUserId", "accessToken", "refreshToken", "publicKey", "expiresAt", "scope", "status", "lastError")
       VALUES ('2026-01-10T12:00:00Z', $1, $2, $3, $4, 'PUBLIC-KEY', '2026-07-10T12:00:00Z', 'offline_access read', $5, $6)`,
      [
        channelId,
        mpUserId,
        overrides.tokens === false
          ? ''
          : cipher.encrypt(`access-${mpUserId}`, legacyAccess(channelId)),
        overrides.tokens === false
          ? ''
          : cipher.encrypt(`refresh-${mpUserId}`, legacyRefresh(channelId)),
        overrides.status ?? 'connected',
        overrides.lastError ?? null,
      ],
    );

  async function seed(db: DataSource) {
    const defaultChannelId = await insert(
      db,
      `INSERT INTO channel (code, token, "defaultLanguageCode", "defaultCurrencyCode", "pricesIncludeTax")
       VALUES ('__default_channel__', 'default-token', 'en', 'ARS', true)`,
    );
    const a = await seedStore(db, 'store-a', defaultChannelId);
    const b = await seedStore(db, 'store-b', defaultChannelId);
    const c = await seedStore(db, 'store-c', defaultChannelId);
    const d = await seedStore(db, 'store-d', defaultChannelId);

    await connection(db, a.channelId, '1111');
    await connection(db, b.channelId, '2222', { status: 'expiring', lastError: 'renewal failed' });
    await connection(db, c.channelId, '3333', { status: 'disconnected', tokens: false });

    const mp = { public: { mpPaymentId: '1' }, mpStatus: 'approved', mpStatusDetail: 'accredited' };
    return {
      a,
      b,
      c,
      d,
      pA1: await payment(db, a.orderId, 'mercado-pago', mp),
      pA2: await payment(db, a.orderId, 'mercado-pago', { ...mp, public: { mpPaymentId: '2' } }),
      pA3: await payment(db, a.orderId, 'mercado-pago', {
        ...mp,
        public: { mpPaymentId: '3' },
        mpAccountUserId: '9999',
      }),
      pB1: await payment(db, b.orderId, 'mercado-pago', { ...mp, public: { mpPaymentId: '4' } }),
      pC1: await payment(db, c.orderId, 'mercado-pago', { ...mp, public: { mpPaymentId: '5' } }),
      pD1: await payment(db, d.orderId, 'dummy', {}),
    };
  }

  const metadataOf = async (db: DataSource, id: string) =>
    JSON.parse((await db.query('SELECT metadata FROM payment WHERE id = $1', [id]))[0].metadata);

  it('turns every connection into an account and an active link, keeping its tokens', async () => {
    process.env.MP_TOKEN_ENCRYPTION_KEY = KEY;
    const { name, legacy } = await previousVersion();
    const data = await seed(legacy);
    await legacy.destroy();

    const db = await upgradeSource(name);
    try {
      await db.runMigrations();

      const accounts = await db.query(
        `SELECT *, "expiresAt"::text AS "expiresAtText" FROM mercado_pago_account ORDER BY "mpUserId"`,
      );
      expect(
        accounts.map((a: { mpUserId: string; status: string }) => [a.mpUserId, a.status]),
      ).toEqual([
        ['1111', 'connected'],
        ['2222', 'expiring'],
        ['3333', 'disconnected'],
      ]);
      const [x, y, z] = accounts;
      expect(x).toMatchObject({
        publicKey: 'PUBLIC-KEY',
        scope: 'offline_access read',
        lastError: null,
      });
      // Wall-clock values are copied as they are, whatever the time zone of the process.
      expect(x.expiresAtText).toBe('2026-07-10 12:00:00');
      expect(y.lastError).toBe('renewal failed');
      // The tokens are the same, encrypted for the account instead of the store.
      expect(cipher.decrypt(x.accessToken, accountAccessContext('1111'))).toBe('access-1111');
      expect(cipher.decrypt(x.refreshToken, accountRefreshContext('1111'))).toBe('refresh-1111');
      expect(() => cipher.decrypt(x.accessToken, legacyAccess(data.a.channelId))).toThrow();
      expect(cipher.decrypt(y.accessToken, accountAccessContext('2222'))).toBe('access-2222');
      // A revoked connection had no tokens and stays without them.
      expect(z.accessToken).toBe('');
      expect(z.refreshToken).toBe('');

      const links = await db.query(
        `SELECT l.*, l."linkedAt"::text AS "linkedAtText", a."mpUserId" FROM mercado_pago_channel_link l JOIN mercado_pago_account a ON a.id = l."accountId" ORDER BY a."mpUserId"`,
      );
      expect(
        links.map((l: { channelId: string; mpUserId: string; status: string }) => [
          l.channelId,
          l.mpUserId,
          l.status,
        ]),
      ).toEqual([
        [data.a.channelId, '1111', 'active'],
        [data.b.channelId, '2222', 'active'],
        [data.c.channelId, '3333', 'active'],
      ]);
      expect(links[0].linkedAtText).toBe('2026-01-10 12:00:00');
      expect(links[0].retiredAt).toBeNull();
      expect(links[0].releasedAt).toBeNull();

      // The old table is gone.
      await expect(db.query('SELECT 1 FROM mercado_pago_connection')).rejects.toThrow();
    } finally {
      await db.destroy();
    }
  });

  it('stamps the payments already taken with the account of their store', async () => {
    process.env.MP_TOKEN_ENCRYPTION_KEY = KEY;
    const { name, legacy } = await previousVersion();
    const data = await seed(legacy);
    await legacy.destroy();

    const db = await upgradeSource(name);
    try {
      await db.runMigrations();

      expect(await metadataOf(db, data.pA1)).toEqual({
        public: { mpPaymentId: '1' },
        mpStatus: 'approved',
        mpStatusDetail: 'accredited',
        mpAccountUserId: '1111',
      });
      expect((await metadataOf(db, data.pA2)).mpAccountUserId).toBe('1111');
      expect((await metadataOf(db, data.pB1)).mpAccountUserId).toBe('2222');
      expect((await metadataOf(db, data.pC1)).mpAccountUserId).toBe('3333');
      // A stamp that is already there is respected, and payments that are not Mercado Pago's are
      // not touched.
      expect((await metadataOf(db, data.pA3)).mpAccountUserId).toBe('9999');
      expect(await metadataOf(db, data.pD1)).toEqual({});
    } finally {
      await db.destroy();
    }
  });

  it('migrates a database with no Mercado Pago data without needing the encryption key', async () => {
    delete process.env.MP_TOKEN_ENCRYPTION_KEY;
    const { name, legacy } = await previousVersion();
    await legacy.destroy();

    const db = await upgradeSource(name);
    try {
      await db.runMigrations();

      expect(await db.query('SELECT 1 FROM mercado_pago_account')).toEqual([]);
      expect(await db.query('SELECT 1 FROM mercado_pago_channel_link')).toEqual([]);
    } finally {
      await db.destroy();
    }
  });

  it('fails clearly, and changes nothing, when tokens must be re-encrypted and there is no key', async () => {
    process.env.MP_TOKEN_ENCRYPTION_KEY = KEY;
    const { name, legacy } = await previousVersion();
    await seed(legacy);
    await legacy.destroy();
    delete process.env.MP_TOKEN_ENCRYPTION_KEY;

    const db = await upgradeSource(name);
    try {
      await expect(db.runMigrations()).rejects.toThrow(/MP_TOKEN_ENCRYPTION_KEY is required/);

      // The whole migration rolled back: the old table is still there, intact.
      expect(await db.query('SELECT count(*)::int AS n FROM mercado_pago_connection')).toEqual([
        { n: 3 },
      ]);
      await expect(db.query('SELECT 1 FROM mercado_pago_account')).rejects.toThrow();
    } finally {
      await db.destroy();
    }
  });

  it('can be reverted: the active links go back to one connection per store', async () => {
    process.env.MP_TOKEN_ENCRYPTION_KEY = KEY;
    const { name, legacy } = await previousVersion();
    const data = await seed(legacy);
    await legacy.destroy();

    const db = await upgradeSource(name);
    try {
      await db.runMigrations();
      await db.undoLastMigration();

      const rows = await db.query(`SELECT * FROM mercado_pago_connection ORDER BY "mpUserId"`);
      expect(
        rows.map((r: { mpUserId: string; channelId: string }) => [r.mpUserId, r.channelId]),
      ).toEqual([
        ['1111', data.a.channelId],
        ['2222', data.b.channelId],
        ['3333', data.c.channelId],
      ]);
      expect(cipher.decrypt(rows[0].accessToken, legacyAccess(data.a.channelId))).toBe(
        'access-1111',
      );
      expect(cipher.decrypt(rows[1].refreshToken, legacyRefresh(data.b.channelId))).toBe(
        'refresh-2222',
      );
      expect(rows[2]).toMatchObject({ status: 'disconnected', accessToken: '' });
      await expect(db.query('SELECT 1 FROM mercado_pago_account')).rejects.toThrow();
      await expect(db.query('SELECT 1 FROM mercado_pago_channel_link')).rejects.toThrow();
    } finally {
      await db.destroy();
    }
  });
  it('adds the registry of issued preferences, with every identifier unique, and can be reverted', async () => {
    process.env.MP_TOKEN_ENCRYPTION_KEY = KEY;
    const { name, legacy } = await previousVersion();
    await legacy.destroy();

    const db = await upgradeWithRegistry(name);
    try {
      await db.runMigrations();
      const account = await insert(
        db,
        `INSERT INTO mercado_pago_account ("mpUserId", "accessToken", "refreshToken", "expiresAt", "status")
         VALUES ('1111', 'a', 'r', now(), 'connected')`,
      );
      const link = await insert(
        db,
        `INSERT INTO mercado_pago_channel_link ("channelId", "accountId", "status", "linkedAt")
         VALUES ('channel-1', $1, 'active', now())`,
        [account],
      );
      const preference = (
        token: string,
        reference: string,
        key: string,
        preferenceId: string | null,
      ) =>
        db.query(
          `INSERT INTO mercado_pago_preference ("token", "externalReference", "idempotencyKey", "orderId", "orderCode", "channelId", "accountId", "linkId", "totalWithTax", "preferenceId")
           VALUES ($1, $2, $3, 'order-1', 'ORDER1', 'channel-1', $4, $5, 1000, $6)`,
          [token, reference, key, account, link, preferenceId],
        );

      await preference('t1', 'ORDER1-t1', 'k1', 'pref-1');
      // Two preferences still waiting for Mercado Pago's answer are fine...
      await preference('t2', 'ORDER1-t2', 'k2', null);
      await preference('t3', 'ORDER1-t3', 'k3', null);
      // ...but no identifier can repeat.
      await expect(preference('t1', 'ORDER1-x', 'kx', 'prefx')).rejects.toThrow(
        /IDX_1de14b1aa6d084981ea6c0582b/,
      );
      await expect(preference('tx', 'ORDER1-t1', 'kx', 'prefx')).rejects.toThrow(
        /IDX_9f5c3dbecfdb09100b529afcd7/,
      );
      await expect(preference('tx', 'ORDER1-x', 'k1', 'prefx')).rejects.toThrow(
        /IDX_e1e97f09a85420a3f5e51ab24e/,
      );
      await expect(preference('tx', 'ORDER1-x', 'kx', 'pref-1')).rejects.toThrow(
        /IDX_8d4fc6922328bea0688b7af271/,
      );
      // A preference cannot point at an account or a link that does not exist.
      await expect(
        db.query(
          `INSERT INTO mercado_pago_preference ("token", "externalReference", "idempotencyKey", "orderId", "orderCode", "channelId", "accountId", "linkId", "totalWithTax")
           VALUES ('ty', 'ORDER1-ty', 'ky', 'order-1', 'ORDER1', 'channel-1', uuid_generate_v4(), $1, 1000)`,
          [link],
        ),
      ).rejects.toThrow(/foreign key/i);

      await db.undoLastMigration();

      await expect(db.query('SELECT 1 FROM mercado_pago_preference')).rejects.toThrow();
      // The accounts and links of the previous migration are untouched.
      expect(await db.query('SELECT count(*)::int AS n FROM mercado_pago_account')).toEqual([
        { n: 1 },
      ]);
      expect(await db.query('SELECT count(*)::int AS n FROM mercado_pago_channel_link')).toEqual([
        { n: 1 },
      ]);
    } finally {
      await db.destroy();
    }
  });
});
