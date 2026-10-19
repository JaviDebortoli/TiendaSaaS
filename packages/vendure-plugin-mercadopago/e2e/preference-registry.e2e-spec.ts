import { TransactionalConnection } from '@vendure/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MercadoPagoAccount,
  MercadoPagoChannelLink,
  MercadoPagoConnectionService,
  MercadoPagoPreference,
  MercadoPagoPreferenceRegistry,
} from '../src';
import { OAuthGrant } from './mp-mock';
import { createMpTestEnvironment, createStore, TestStore } from './test-env';

const { server, adminClient, init } = createMpTestEnvironment(3112);

let store: TestStore;
let connections: MercadoPagoConnectionService;
let registry: MercadoPagoPreferenceRegistry;
let accountId: string | number;
let linkId: string | number;

const grant: OAuthGrant = {
  access_token: 'APP_USR-registry',
  refresh_token: 'TG-registry',
  user_id: 9301,
  expires_in: 15552000,
  scope: 'offline_access',
};

const rows = () =>
  server.app.get(TransactionalConnection).rawConnection.getRepository(MercadoPagoPreference);

const issue = (orderCode: string, idempotencyKey: string) =>
  registry.issue({
    orderId: 1,
    orderCode,
    channelId: store.channelId,
    accountId,
    linkId,
    totalWithTax: 12_345,
    idempotencyKey,
  });

beforeAll(async () => {
  await init();
  connections = server.app.get(MercadoPagoConnectionService);
  registry = server.app.get(MercadoPagoPreferenceRegistry);
  store = await createStore(adminClient, 'reg-a');
  await connections.link(store.channelId, grant);
  const link = (await connections.findActiveLink(store.channelId))!;
  accountId = link.accountId;
  linkId = link.id;
}, 120_000);

afterAll(async () => {
  await server.destroy();
});

beforeEach(async () => {
  await rows().createQueryBuilder().delete().execute();
});

describe('registry of issued preferences (PRD 9.6, 9.7)', () => {
  it('issues an identifier of at least 128 bits, in base64url, and the reference built from it', async () => {
    const entry = await issue('ORDER1', 'key-1');

    expect(entry.token).toMatch(/^[A-Za-z0-9_-]{22}$/); // 16 bytes = 128 bits
    expect(Buffer.from(entry.token, 'base64url')).toHaveLength(16);
    expect(entry.externalReference).toBe(`ORDER1-${entry.token}`);
    expect(entry).toMatchObject({
      orderCode: 'ORDER1',
      totalWithTax: 12_345,
      preferenceId: null,
    });
    expect(entry.createdAt).toBeInstanceOf(Date);
  });

  it('never repeats an identifier', async () => {
    const entries = await Promise.all(
      Array.from({ length: 25 }, (_, i) => issue(`ORDER${i}`, `key-${i}`)),
    );

    expect(new Set(entries.map((e) => e.token)).size).toBe(25);
    expect(new Set(entries.map((e) => e.externalReference)).size).toBe(25);
  });

  it('returns the same row for a repeated request, so its reference does not change', async () => {
    const first = await issue('ORDER1', 'same-key');
    const again = await issue('ORDER1', 'same-key');

    expect(again.id).toBe(first.id);
    expect(again.externalReference).toBe(first.externalReference);
    expect(await rows().count()).toBe(1);
  });

  it('gives identical requests made at the same moment one row', async () => {
    const entries = await Promise.all(Array.from({ length: 6 }, () => issue('ORDER1', 'racing')));

    expect(new Set(entries.map((e) => e.id)).size).toBe(1);
    expect(new Set(entries.map((e) => e.token)).size).toBe(1);
    expect(await rows().count()).toBe(1);
  });

  it('remembers the preference id Mercado Pago answers with', async () => {
    const entry = await issue('ORDER1', 'key-1');

    await registry.setPreferenceId(entry.id, 'pref-123');

    expect((await registry.findByExternalReference(entry.externalReference))!.preferenceId).toBe(
      'pref-123',
    );
  });

  it('finds a preference by its whole reference, with its account and link', async () => {
    const entry = await issue('ORDER1', 'key-1');

    const found = (await registry.findByExternalReference(entry.externalReference))!;

    expect(found.id).toBe(entry.id);
    expect(found.account).toBeInstanceOf(MercadoPagoAccount);
    expect(found.account.mpUserId).toBe('9301');
    expect(found.link).toBeInstanceOf(MercadoPagoChannelLink);
  });

  it('does not find a reference that was not issued, however close it looks', async () => {
    const entry = await issue('ORDER1', 'key-1');

    expect(await registry.findByExternalReference('ORDER1')).toBeNull(); // the old format
    expect(await registry.findByExternalReference(`ORDER2-${entry.token}`)).toBeNull();
    expect(await registry.findByExternalReference(`${entry.externalReference}x`)).toBeNull();
    expect(
      await registry.findByExternalReference(entry.externalReference.toLowerCase()),
    ).toBeNull();
    expect(await registry.findByExternalReference('')).toBeNull();
  });

  it('finds a preference by the token its notification URL carries, and only a well-formed one', async () => {
    const entry = await issue('ORDER1', 'key-1');

    expect((await registry.findByToken(entry.token))!.id).toBe(entry.id);
    expect(await registry.findByToken('short')).toBeNull();
    expect(await registry.findByToken(`${entry.token}0`)).toBeNull();
    expect(await registry.findByToken("' OR 1=1 --")).toBeNull();
  });

  it('lists the preferences issued for an order', async () => {
    await issue('ORDER1', 'a');
    await issue('ORDER1', 'b');
    await issue('ORDER2', 'c');

    expect((await registry.listForOrder('ORDER1')).map((e) => e.orderCode)).toEqual([
      'ORDER1',
      'ORDER1',
    ]);
    expect(await registry.listForOrder('NONE')).toEqual([]);
  });
});
