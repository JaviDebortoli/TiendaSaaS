import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCommerce, isPaidState } from '../src';
import { API_URL, CHANNEL_TOKEN, FakeShop, order } from './fake-shop';

const shop = new FakeShop();
beforeAll(() => shop.start());
afterAll(() => shop.stop());
beforeEach(() => shop.reset());

/** A clock that only moves when the code sleeps, so timing logic is exact and instant. */
function fakeClock() {
  let time = 0;
  return {
    now: () => time,
    sleep: async (ms: number) => {
      time += ms;
    },
  };
}

const { payment } = createCommerce({ apiUrl: API_URL, channelToken: CHANNEL_TOKEN });

/** Answers `OrderByCode` with a sequence of states, repeating the last one. */
function orderStates(...states: string[]) {
  let index = 0;
  shop.on('OrderByCode', () => ({
    orderByCode: order({ state: states[Math.min(index++, states.length - 1)] }),
  }));
}

/** What the redirect brings as `external_reference`: opaque to this package. */
const REFERENCE = 'ORDER1-AAAAAAAAAAAAAAAAAAAAAA';

const sync = (outcome: string, orderCode = 'ORDER1') =>
  shop.on('SyncMercadoPagoPayment', {
    syncMercadoPagoPayment: {
      __typename: 'MercadoPagoPaymentSync',
      outcome,
      orderCode,
      orderState: 'x',
    },
  });

describe('waitForPayment (PRD 9.6 steps 4-6)', () => {
  it('answers paid as soon as the server says the order is settled, without calling sync', async () => {
    orderStates('PaymentSettled');

    const result = await payment.waitForPayment({
      orderCode: 'ORDER1',
      externalReference: REFERENCE,
      paymentId: '99',
      ...fakeClock(),
    });

    expect(result.state).toBe('paid');
    expect(shop.called('SyncMercadoPagoPayment')).toHaveLength(0);
  });

  it('polls until the webhook settles the order', async () => {
    orderStates('ArrangingPayment', 'ArrangingPayment', 'ArrangingPayment', 'PaymentSettled');

    const result = await payment.waitForPayment({
      orderCode: 'ORDER1',
      externalReference: REFERENCE,
      paymentId: '99',
      intervalMs: 1000,
      syncAfterMs: 10_000,
      ...fakeClock(),
    });

    expect(result.state).toBe('paid');
    expect(shop.called('OrderByCode')).toHaveLength(4);
    expect(shop.called('SyncMercadoPagoPayment')).toHaveLength(0);
  });

  it('never trusts the redirect: with the webhook late it asks the server to check the payment after 10 s', async () => {
    orderStates('ArrangingPayment', 'ArrangingPayment'); // still unpaid when sync runs
    sync('settled');
    // After a successful sync the order is settled.
    let reads = 0;
    shop.on('OrderByCode', () => ({
      orderByCode: order({ state: ++reads > 11 ? 'PaymentSettled' : 'ArrangingPayment' }),
    }));

    const result = await payment.waitForPayment({
      orderCode: 'ORDER1',
      externalReference: REFERENCE,
      paymentId: '99',
      intervalMs: 1000,
      syncAfterMs: 10_000,
      ...fakeClock(),
    });

    expect(shop.called('SyncMercadoPagoPayment')).toHaveLength(1);
    expect(shop.called('SyncMercadoPagoPayment')[0]!.variables).toEqual({
      externalReference: REFERENCE,
      paymentId: '99',
    });
    expect(result.state).toBe('paid');
  });

  it('does not say paid just because sync said settled: the order itself must be settled', async () => {
    orderStates('ArrangingPayment');
    sync('settled');

    const result = await payment.waitForPayment({
      orderCode: 'ORDER1',
      externalReference: REFERENCE,
      paymentId: '99',
      syncAfterMs: 0,
      ...fakeClock(),
    });

    expect(result.state).toBe('processing');
  });

  it('does not call sync without a payment id (the redirect carried none)', async () => {
    orderStates('ArrangingPayment');

    const result = await payment.waitForPayment({
      orderCode: 'ORDER1',
      timeoutMs: 15_000,
      ...fakeClock(),
    });

    expect(result.state).toBe('processing');
    expect(shop.called('SyncMercadoPagoPayment')).toHaveLength(0);
  });

  it('does not call sync without the reference of the redirect, because it is what names the preference', async () => {
    orderStates('ArrangingPayment');

    const result = await payment.waitForPayment({
      orderCode: 'ORDER1',
      paymentId: '99',
      syncAfterMs: 0,
      timeoutMs: 5000,
      ...fakeClock(),
    });

    expect(result.state).toBe('processing');
    expect(shop.called('SyncMercadoPagoPayment')).toHaveLength(0);
  });

  it('calls sync only once', async () => {
    orderStates('ArrangingPayment');
    shop.on('SyncMercadoPagoPayment', {
      syncMercadoPagoPayment: {
        __typename: 'MercadoPagoError',
        errorCode: 'MERCADOPAGO_ERROR',
        message: 'unavailable',
        reason: 'MERCADOPAGO_UNAVAILABLE',
      },
    });

    const result = await payment.waitForPayment({
      orderCode: 'ORDER1',
      externalReference: REFERENCE,
      paymentId: '99',
      syncAfterMs: 2000,
      timeoutMs: 20_000,
      ...fakeClock(),
    });

    expect(shop.called('SyncMercadoPagoPayment')).toHaveLength(1);
    expect(result.state).toBe('processing');
  });

  it.each([
    ['pending', 'pending'],
    ['rejected', 'failed'],
    ['cancelled', 'failed'],
    ['needs_review', 'review'],
  ] as const)(
    'maps the server verdict "%s" to "%s" without waiting for the timeout',
    async (outcome, expected) => {
      orderStates('ArrangingPayment');
      sync(outcome);
      const clock = fakeClock();

      const result = await payment.waitForPayment({
        orderCode: 'ORDER1',
        externalReference: REFERENCE,
        paymentId: '99',
        syncAfterMs: 3000,
        timeoutMs: 60_000,
        ...clock,
      });

      expect(result.state).toBe(expected);
      expect(clock.now()).toBeLessThan(10_000);
    },
  );

  it('survives a failing sync call and keeps waiting', async () => {
    orderStates(
      'ArrangingPayment',
      'ArrangingPayment',
      'ArrangingPayment',
      'ArrangingPayment',
      'PaymentSettled',
    );
    shop.on('SyncMercadoPagoPayment', { __graphqlError: 'boom' });

    const result = await payment.waitForPayment({
      orderCode: 'ORDER1',
      externalReference: REFERENCE,
      paymentId: '99',
      syncAfterMs: 1000,
      ...fakeClock(),
    });

    expect(result.state).toBe('paid');
  });

  it('answers processing when the timeout passes with nothing confirmed', async () => {
    orderStates('ArrangingPayment');

    const result = await payment.waitForPayment({
      orderCode: 'ORDER1',
      timeoutMs: 5000,
      ...fakeClock(),
    });

    expect(result).toMatchObject({ state: 'processing', orderCode: 'ORDER1' });
  });

  it('treats an order this session may not read as not confirmed, instead of failing', async () => {
    shop.on(
      'OrderByCode',
      () =>
        new Response(
          JSON.stringify({
            errors: [
              { message: 'You are not currently authorized', extensions: { code: 'FORBIDDEN' } },
            ],
            data: null,
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );

    const result = await payment.waitForPayment({
      orderCode: 'SOMEONE',
      timeoutMs: 3000,
      ...fakeClock(),
    });

    expect(result).toMatchObject({ state: 'processing', order: null });
  });

  it('stops waiting when aborted', async () => {
    orderStates('ArrangingPayment');
    const controller = new AbortController();
    const sleep = async () => {
      controller.abort(new Error('navigated away'));
      throw controller.signal.reason;
    };

    await expect(
      payment.waitForPayment({
        orderCode: 'ORDER1',
        signal: controller.signal,
        now: () => 0,
        sleep,
      }),
    ).rejects.toThrow('navigated away');
  });
});

describe('waitForPayment without an order of the session', () => {
  it('reads no order until the server says which one the payment is for, and then reads that one', async () => {
    sync('settled', 'ORDER9');
    shop.on('OrderByCode', () => ({ orderByCode: order({ state: 'PaymentSettled' }) }));

    const result = await payment.waitForPayment({
      externalReference: REFERENCE,
      paymentId: '99',
      syncAfterMs: 3000,
      ...fakeClock(),
    });

    // Nothing was read while no order was known: the reference is not read for one.
    expect(shop.called('OrderByCode')).toHaveLength(1);
    expect(shop.called('OrderByCode')[0]!.variables).toEqual({ code: 'ORDER9' });
    expect(shop.called('SyncMercadoPagoPayment')).toHaveLength(1);
    expect(result).toMatchObject({ state: 'paid', orderCode: 'ORDER9' });
  });

  it('never derives the order from the text of the reference', async () => {
    sync('unknown', ''); // the server does not know the reference
    orderStates('PaymentSettled');

    const result = await payment.waitForPayment({
      externalReference: REFERENCE,
      paymentId: '99',
      syncAfterMs: 2000,
      timeoutMs: 8000,
      ...fakeClock(),
    });

    // The reference starts with "ORDER1", but nothing may be asked about that code.
    expect(shop.called('OrderByCode')).toHaveLength(0);
    expect(result).toEqual({ state: 'processing', orderCode: undefined, order: null });
  });

  it('only waits when it has neither an order nor a reference to ask about', async () => {
    orderStates('PaymentSettled');

    const result = await payment.waitForPayment({ timeoutMs: 4000, ...fakeClock() });

    expect(result).toEqual({ state: 'processing', orderCode: undefined, order: null });
    expect(shop.called('OrderByCode')).toHaveLength(0);
    expect(shop.called('SyncMercadoPagoPayment')).toHaveLength(0);
  });

  it('answers with the verdict of the server even when this session cannot read the order', async () => {
    sync('needs_review', 'ORDER9');
    shop.on(
      'OrderByCode',
      () =>
        new Response(
          JSON.stringify({
            errors: [{ message: 'not authorized', extensions: { code: 'FORBIDDEN' } }],
            data: null,
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );

    const result = await payment.waitForPayment({
      externalReference: REFERENCE,
      paymentId: '99',
      syncAfterMs: 0,
      ...fakeClock(),
    });

    expect(result).toEqual({ state: 'review', orderCode: 'ORDER9', order: null });
  });
});

describe('isPaidState', () => {
  it.each(['PaymentAuthorized', 'PaymentSettled', 'Shipped', 'Delivered'])(
    '%s is paid',
    (state) => {
      expect(isPaidState(state)).toBe(true);
    },
  );

  it.each(['AddingItems', 'ArrangingPayment', 'Cancelled', 'Draft', undefined, null])(
    '%s is not paid',
    (state) => {
      expect(isPaidState(state as string | null | undefined)).toBe(false);
    },
  );
});

describe('the API does not take the redirect status as input', () => {
  it('has no option that could carry it (enforced by the type checker)', () => {
    // `status=approved` in the redirect URL must not be something a caller can pass in.
    const neverCalled = () =>
      payment.waitForPayment({
        orderCode: 'X',
        // @ts-expect-error the redirect status is deliberately not an option
        status: 'approved',
      });
    expect(neverCalled).toBeTypeOf('function');
  });
});
