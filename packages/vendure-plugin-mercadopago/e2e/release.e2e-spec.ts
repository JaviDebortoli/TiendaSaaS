import { ConfigService, EventBus, Payment, TransactionalConnection } from '@vendure/core';
import gql from 'graphql-tag';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MercadoPagoAccount,
  MercadoPagoAttentionEvent,
  MercadoPagoChannelLink,
  MercadoPagoConnectionService,
  MercadoPagoPlugin,
  MercadoPagoReleaseService,
  RELEASE_TASK_ID,
} from '../src';
import { accountNotLinkedMessage } from '../src/services/payment-operations.service';
import { MercadoPagoPaymentProcessor } from '../src/services/payment-processor.service';
import { MercadoPagoMock, OAuthGrant } from './mp-mock';
import {
  checkoutAsGuest,
  PayableStore,
  provisionStore,
  readOrder,
  STOREFRONT_URL,
} from './shop-helpers';
import {
  asStoreAdmin,
  asSuperAdmin,
  createMpTestEnvironment,
  createStore,
  TestStore,
} from './test-env';

const { server, adminClient, shopClient, init } = createMpTestEnvironment(3111);
const mp = new MercadoPagoMock();

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

let storeA: TestStore;
let storeB: TestStore;
let payableA: PayableStore;
let payableB: PayableStore;
let connections: MercadoPagoConnectionService;
let releases: MercadoPagoReleaseService;
let processor: MercadoPagoPaymentProcessor;
const events: MercadoPagoAttentionEvent[] = [];

/** Each test sells with an account of its own: payments stay in the database between tests. */
let userCounter = 9200;
let X: number;
let gx: OAuthGrant;
const grantOf = (userId: number): OAuthGrant => ({
  access_token: `APP_USR-release-${userId}`,
  refresh_token: `TG-release-${userId}`,
  user_id: userId,
  expires_in: 15552000,
  scope: 'offline_access',
});

const repo = <T extends object>(entity: new () => T) =>
  server.app.get(TransactionalConnection).rawConnection.getRepository(entity);
const accounts = () => repo(MercadoPagoAccount);
const links = () => repo(MercadoPagoChannelLink);
const payments = () => repo(Payment);

let nextId = 7000;
/** Sells an order of `store` with `grant`'s account and says it was paid `daysAgo` days ago. */
async function sale(store: TestStore, payable: PayableStore, grant: OAuthGrant, daysAgo = 0) {
  const order = await checkoutAsGuest(shopClient, store, payable);
  const payment = mp.addPayment({
    id: ++nextId,
    status: 'approved',
    transaction_amount: order.totalWithTax / 100,
    currency_id: 'ARS',
    external_reference: order.code,
    ownerToken: grant.access_token,
    collector_id: grant.user_id,
  });
  expect(
    await processor.process({ mpPaymentId: String(payment.id), mpUserId: String(grant.user_id) }),
  ).toMatchObject({ outcome: 'settled' });
  const found = await readOrder(adminClient, store, order.code);
  await payments().update(
    { id: Number(found.payments[0]!.id.replace(/^T_/, '')) },
    { createdAt: ago(daysAgo) },
  );
  return order;
}

/** Retires the link of `store` and says it happened `daysAgo` days ago. */
async function retire(store: TestStore, daysAgo: number) {
  await connections.retire(store.channelId);
  await links().update(
    { channelId: store.channelId, status: 'retired' },
    { retiredAt: ago(daysAgo) },
  );
}

const linkOf = (store: TestStore) =>
  links().findOneOrFail({ where: { channelId: store.channelId }, relations: { account: true } });
const account = (userId: number) => accounts().findOneByOrFail({ mpUserId: String(userId) });
const released = () => events.filter((e) => e.reason === 'link_released');

beforeAll(async () => {
  mp.start();
  await init();
  connections = server.app.get(MercadoPagoConnectionService);
  releases = server.app.get(MercadoPagoReleaseService);
  processor = server.app.get(MercadoPagoPaymentProcessor);
  server.app
    .get(EventBus)
    .ofType(MercadoPagoAttentionEvent)
    .subscribe((event) => events.push(event));
  storeA = await createStore(adminClient, 'rl-a', { storefrontUrl: STOREFRONT_URL });
  storeB = await createStore(adminClient, 'rl-b', { storefrontUrl: STOREFRONT_URL });
  payableA = await provisionStore(adminClient, storeA);
  payableB = await provisionStore(adminClient, storeB);
}, 120_000);

afterAll(async () => {
  mp.stop();
  await server.destroy();
});

beforeEach(async () => {
  mp.reset();
  events.length = 0;
  X = ++userCounter;
  gx = grantOf(X);
  await links().createQueryBuilder().delete().execute();
  await accounts().createQueryBuilder().delete().execute();
});

describe('automatic release of retired links (PRD 9.4)', () => {
  it('is registered as a daily scheduled task', () => {
    const tasks = server.app.get(ConfigService).schedulerOptions.tasks ?? [];
    expect(tasks.find((t) => t.id === RELEASE_TASK_ID)?.options.schedule).toBeTruthy();
  });

  it('uses 180 days since the last payment and 30 days since the retirement by default', () => {
    expect(MercadoPagoPlugin.options).toMatchObject({
      releaseAfterLastPaymentDays: 180,
      releaseAfterRetiredDays: 30,
    });
  });

  it('does not release while the last payment is still inside the refund period', async () => {
    await connections.link(storeA.channelId, gx);
    await sale(storeA, payableA, gx, 10);
    await retire(storeA, 40);

    expect(await releases.releaseDueLinks()).toEqual({ released: 0, due: [] });

    expect((await linkOf(storeA)).status).toBe('retired');
    expect(connections.isUsable(await account(X))).toBe(true);
    expect(released()).toHaveLength(0);
  });

  it('does not release while the link was retired less than 30 days ago', async () => {
    await connections.link(storeA.channelId, gx);
    await sale(storeA, payableA, gx, 200);
    await retire(storeA, 10);

    expect((await releases.releaseDueLinks()).released).toBe(0);

    expect((await linkOf(storeA)).status).toBe('retired');
  });

  it('releases when both periods have passed, deletes the tokens and tells the store', async () => {
    await connections.link(storeA.channelId, gx);
    await sale(storeA, payableA, gx, 200);
    await retire(storeA, 40);

    const result = await releases.releaseDueLinks();

    expect(result).toEqual({
      released: 1,
      due: [{ channelId: storeA.channelId, mpUserId: String(X) }],
    });
    const link = await linkOf(storeA);
    expect(link.status).toBe('released');
    expect(link.releasedAt).toBeInstanceOf(Date);
    const row = await account(X);
    expect(row).toMatchObject({ status: 'released', accessToken: '', refreshToken: '' });
    expect(released().map((e) => [e.channelId, e.details.mpUserId])).toEqual([
      [storeA.channelId, String(X)],
    ]);
  });

  it('releases a link that never settled a payment once it has been retired for 30 days', async () => {
    await connections.link(storeA.channelId, gx);
    await retire(storeA, 31);

    expect((await releases.releaseDueLinks()).released).toBe(1);
  });

  it('counts the payments settled after the retirement too', async () => {
    await connections.link(storeA.channelId, gx);
    await retire(storeA, 200);
    // A pending payment that was approved after the store retired the account, a week ago.
    await sale(storeA, payableA, gx, 7);

    expect((await releases.releaseDueLinks()).released).toBe(0);
  });

  it('never releases a link the store still sells with', async () => {
    await connections.link(storeA.channelId, gx);
    await sale(storeA, payableA, gx, 400);

    expect((await releases.releaseDueLinks()).released).toBe(0);
    expect((await linkOf(storeA)).status).toBe('active');
  });

  it('keeps the tokens when the account is still active in another store', async () => {
    await connections.link(storeA.channelId, gx);
    await retire(storeA, 40);
    await connections.link(storeB.channelId, gx); // X now sells for store B

    expect((await releases.releaseDueLinks()).released).toBe(1);

    expect((await linkOf(storeA)).status).toBe('released');
    const row = await account(X);
    expect(row.status).toBe('connected');
    expect(connections.isUsable(row)).toBe(true);
    expect((await connections.getAccessToken(storeB.channelId)).accessToken).toBe(gx.access_token);
  });

  it('keeps the tokens while another store still has the account retired, and deletes them with the last link', async () => {
    await connections.link(storeA.channelId, gx);
    await retire(storeA, 40);
    await connections.link(storeB.channelId, gx);
    await sale(storeB, payableB, gx, 5);
    await retire(storeB, 40); // retired in B too, but B sold 5 days ago

    expect((await releases.releaseDueLinks()).released).toBe(1);
    expect(connections.isUsable(await account(X))).toBe(true);

    // The last payment of B falls out of the refund period.
    await payments()
      .createQueryBuilder()
      .update()
      .set({ createdAt: ago(200) })
      .execute();
    expect((await releases.releaseDueLinks()).released).toBe(1);

    expect(await account(X)).toMatchObject({
      status: 'released',
      accessToken: '',
      refreshToken: '',
    });
  });

  it('can be told to only list what it would release', async () => {
    await connections.link(storeA.channelId, gx);
    await retire(storeA, 40);

    const result = await releases.releaseDueLinks(new Date(), { dryRun: true });

    expect(result).toEqual({
      released: 0,
      due: [{ channelId: storeA.channelId, mpUserId: String(X) }],
    });
    expect((await linkOf(storeA)).status).toBe('retired');
  });

  it('takes both windows from the plugin options', async () => {
    const short = new MercadoPagoReleaseService(
      server.app.get(TransactionalConnection),
      connections,
      server.app.get(EventBus),
      { ...MercadoPagoPlugin.options, releaseAfterLastPaymentDays: 20, releaseAfterRetiredDays: 5 },
    );
    await connections.link(storeA.channelId, gx);
    await sale(storeA, payableA, gx, 25);
    await retire(storeA, 6);

    // The defaults (180 and 30) would keep it; 20 and 5 do not.
    expect((await releases.releaseDueLinks()).released).toBe(0);
    expect((await short.releaseDueLinks()).released).toBe(1);
  });

  it('lets the store take the account again after it was released', async () => {
    await connections.link(storeA.channelId, gx);
    await retire(storeA, 40);
    await releases.releaseDueLinks();
    expect((await account(X)).status).toBe('released');

    await connections.link(storeA.channelId, gx);

    expect((await linkOf(storeA)).status).toBe('active');
    expect(connections.isUsable(await account(X))).toBe(true);
  });
});

describe('refunds after a link is released (PRD 9.9)', () => {
  const REFUND = gql`
    mutation ($input: RefundOrderInput!) {
      refundOrder(input: $input) {
        __typename
        ... on Refund {
          state
          metadata
        }
        ... on ErrorResult {
          errorCode
          message
        }
      }
    }
  `;

  async function refundWhole(store: TestStore, code: string) {
    const found = await readOrder(adminClient, store, code);
    const { order } = await adminClient.query<{
      order: { lines: { id: string; quantity: number }[] };
    }>(
      gql`
        query ($id: ID!) {
          order(id: $id) {
            lines {
              id
              quantity
            }
          }
        }
      `,
      { id: found.id },
    );
    const { refundOrder } = await adminClient.query(REFUND, {
      input: {
        lines: order.lines.map((line) => ({ orderLineId: line.id, quantity: line.quantity })),
        shipping: 0,
        adjustment: 0,
        reason: 'Customer request',
        paymentId: found.payments[0]!.id,
      },
    });
    return refundOrder;
  }

  it('fails with a message the owner can act on when the account is gone', async () => {
    await connections.link(storeA.channelId, gx);
    const order = await sale(storeA, payableA, gx, 200);
    await retire(storeA, 40);
    await releases.releaseDueLinks();
    mp.requests = [];

    const refund = await refundWhole(storeA, order.code);

    expect(refund.state).toBe('Failed');
    expect(refund.metadata.errorMessage).toBe(
      `Este pago se cobró en la cuenta ${X}, que ya no está vinculada. Hacé el reembolso desde el panel de Mercado Pago de esa cuenta.`,
    );
    expect(refund.metadata.errorMessage).toBe(accountNotLinkedMessage(String(X)));
    expect(mp.requests.filter((r) => r.path.endsWith('/refunds'))).toHaveLength(0);
  });

  it('does not refund through the token of an account another store uses now', async () => {
    await connections.link(storeA.channelId, gx);
    const order = await sale(storeA, payableA, gx, 200);
    await retire(storeA, 40);
    await connections.link(storeB.channelId, gx); // the account still has tokens, for B
    await releases.releaseDueLinks();
    mp.requests = [];

    const refund = await refundWhole(storeA, order.code);

    expect(refund.state).toBe('Failed');
    expect(refund.metadata.errorMessage).toBe(accountNotLinkedMessage(String(X)));
    expect(mp.requests.filter((r) => r.path.endsWith('/refunds'))).toHaveLength(0);
  });

  it('still refunds while the link is retired', async () => {
    await connections.link(storeA.channelId, gx);
    const order = await sale(storeA, payableA, gx, 100);
    await retire(storeA, 90);

    expect((await refundWhole(storeA, order.code)).state).toBe('Settled');
  });
});

describe('superadmin tools (PRD 9.9)', () => {
  const RETIRE = gql`
    mutation ($channelId: ID!) {
      retireMercadoPagoAccount(channelId: $channelId)
    }
  `;
  const LINKS = gql`
    query ($channelId: ID!) {
      mercadoPagoChannelLinks(channelId: $channelId) {
        id
        channelId
        mpUserId
        status
        accountStatus
        retiredAt
        estimatedReleaseAt
      }
    }
  `;
  const PREVIEW = gql`
    query ($linkId: ID!) {
      mercadoPagoReleasePreview(linkId: $linkId) {
        refundablePayments
        refundPeriodDays
        link {
          status
        }
      }
    }
  `;
  const RELEASE = gql`
    mutation ($input: ReleaseMercadoPagoLinkInput!) {
      releaseMercadoPagoLink(input: $input) {
        status
        accountStatus
        releasedAt
      }
    }
  `;

  it('retires the account a store sells with, deleting nothing', async () => {
    await connections.link(storeA.channelId, gx);
    await asSuperAdmin(adminClient);

    const { retireMercadoPagoAccount } = await adminClient.query(RETIRE, {
      channelId: storeA.apiChannelId,
    });

    expect(retireMercadoPagoAccount).toBe(true);
    expect((await linkOf(storeA)).status).toBe('retired');
    expect(connections.isUsable(await account(X))).toBe(true);
    expect(await connections.isChannelUsable(storeA.channelId)).toBe(false);
    // Nothing left to retire.
    expect(
      (await adminClient.query(RETIRE, { channelId: storeA.apiChannelId }))
        .retireMercadoPagoAccount,
    ).toBe(false);
  });

  it('shows the refundable payments before releasing, and releases only with an explicit confirmation', async () => {
    await connections.link(storeA.channelId, gx);
    await sale(storeA, payableA, gx, 20);
    await sale(storeA, payableA, gx, 150);
    await sale(storeA, payableA, gx, 400); // outside the refund period
    await retire(storeA, 5);
    await asSuperAdmin(adminClient);
    const { mercadoPagoChannelLinks } = await adminClient.query(LINKS, {
      channelId: storeA.apiChannelId,
    });
    expect(mercadoPagoChannelLinks).toHaveLength(1);
    const [link] = mercadoPagoChannelLinks;
    expect(link).toMatchObject({
      channelId: storeA.apiChannelId,
      mpUserId: String(X),
      status: 'retired',
      accountStatus: 'connected',
    });
    // Two of its three sales could still be refunded.
    const { mercadoPagoReleasePreview } = await adminClient.query(PREVIEW, { linkId: link.id });
    expect(mercadoPagoReleasePreview).toEqual({
      refundablePayments: 2,
      refundPeriodDays: 180,
      link: { status: 'retired' },
    });

    // Without the confirmation nothing happens.
    await expect(
      adminClient.query(RELEASE, { input: { linkId: link.id, confirm: false } }),
    ).rejects.toThrow(/confirm/i);
    expect((await linkOf(storeA)).status).toBe('retired');

    const { releaseMercadoPagoLink } = await adminClient.query(RELEASE, {
      input: { linkId: link.id, confirm: true },
    });

    expect(releaseMercadoPagoLink).toMatchObject({ status: 'released', accountStatus: 'released' });
    expect(await account(X)).toMatchObject({ accessToken: '', refreshToken: '' });
    expect(released().map((e) => e.channelId)).toEqual([storeA.channelId]);
  });

  it('refuses to release a link the store still sells with, or one already released', async () => {
    await connections.link(storeA.channelId, gx);
    await asSuperAdmin(adminClient);
    const { mercadoPagoChannelLinks } = await adminClient.query(LINKS, {
      channelId: storeA.apiChannelId,
    });
    const linkId = mercadoPagoChannelLinks[0].id;

    await expect(adminClient.query(RELEASE, { input: { linkId, confirm: true } })).rejects.toThrow(
      /retire it first/i,
    );

    await connections.retire(storeA.channelId);
    await adminClient.query(RELEASE, { input: { linkId, confirm: true } });
    await expect(adminClient.query(RELEASE, { input: { linkId, confirm: true } })).rejects.toThrow(
      /already released/i,
    );
  });

  it('is not available to the administrators of a store', async () => {
    await connections.link(storeA.channelId, gx);
    await asStoreAdmin(adminClient, storeA);

    await expect(adminClient.query(RETIRE, { channelId: storeA.apiChannelId })).rejects.toThrow(
      /not currently authorized/i,
    );
    await expect(adminClient.query(LINKS, { channelId: storeA.apiChannelId })).rejects.toThrow(
      /not currently authorized/i,
    );
    await expect(
      adminClient.query(RELEASE, { input: { linkId: 'T_1', confirm: true } }),
    ).rejects.toThrow(/not currently authorized/i);
    expect((await linkOf(storeA)).status).toBe('active');
  });
});

describe('what the dashboard shows (PRD 5.4)', () => {
  const PREVIOUS = gql`
    query {
      mercadoPagoPreviousAccounts {
        mpUserId
        status
        accountStatus
        retiredAt
        estimatedReleaseAt
      }
      mercadoPagoConnection {
        mpUserId
        connected
      }
    }
  `;

  it('lists the accounts the store used before, with the date they will be released', async () => {
    const gy = grantOf(++userCounter);
    await connections.link(storeA.channelId, gx);
    await sale(storeA, payableA, gx, 100);
    await connections.link(storeA.channelId, gy); // X is retired just now
    await asStoreAdmin(adminClient, storeA);

    const { mercadoPagoPreviousAccounts, mercadoPagoConnection } =
      await adminClient.query(PREVIOUS);

    expect(mercadoPagoConnection).toMatchObject({ mpUserId: String(gy.user_id), connected: true });
    expect(mercadoPagoPreviousAccounts).toHaveLength(1);
    const [previous] = mercadoPagoPreviousAccounts;
    expect(previous).toMatchObject({
      mpUserId: String(X),
      status: 'retired',
      accountStatus: 'connected',
    });
    // The later of "30 days from now" and "180 days after the last payment (100 days ago)".
    const estimated = new Date(previous.estimatedReleaseAt).getTime();
    expect(estimated).toBeGreaterThan(Date.now() + 79 * DAY);
    expect(estimated).toBeLessThan(Date.now() + 81 * DAY);
  });

  it('shows no active account for a store that only has a retired one', async () => {
    await connections.link(storeA.channelId, gx);
    await connections.retire(storeA.channelId);
    await asStoreAdmin(adminClient, storeA);

    const { mercadoPagoPreviousAccounts, mercadoPagoConnection } =
      await adminClient.query(PREVIOUS);

    expect(mercadoPagoConnection).toBeNull();
    expect(mercadoPagoPreviousAccounts.map((a: { mpUserId: string }) => a.mpUserId)).toEqual([
      String(X),
    ]);
  });

  it('does not show the accounts of other stores', async () => {
    await connections.link(storeA.channelId, gx);
    await connections.retire(storeA.channelId);
    const other = grantOf(++userCounter);
    await connections.link(storeB.channelId, other);
    await connections.retire(storeB.channelId);
    await asStoreAdmin(adminClient, storeB);

    const { mercadoPagoPreviousAccounts } = await adminClient.query(PREVIOUS);

    expect(mercadoPagoPreviousAccounts.map((a: { mpUserId: string }) => a.mpUserId)).toEqual([
      String(other.user_id),
    ]);
  });
});
