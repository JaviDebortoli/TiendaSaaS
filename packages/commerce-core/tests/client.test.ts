import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommerceError, createCommerce, memorySession } from '../src';
import { API_URL, CHANNEL_TOKEN, FakeShop, order } from './fake-shop';

const shop = new FakeShop();
beforeAll(() => shop.start());
afterAll(() => shop.stop());
beforeEach(() => shop.reset());

const commerce = (session = memorySession()) =>
  createCommerce({ apiUrl: API_URL, channelToken: CHANNEL_TOKEN, session });

describe('channel and session', () => {
  it('sends the channel token on every request', async () => {
    shop.on('ActiveOrder', { activeOrder: null });

    await commerce().cart.getCart();

    expect(shop.calls[0]!.headers.get('vendure-token')).toBe(CHANNEL_TOKEN);
  });

  it('keeps the session token the server issues and sends it back as a bearer token', async () => {
    const session = memorySession();
    const store = commerce(session);
    shop.issueToken = 'session-token-1';
    shop.on('ActiveOrder', { activeOrder: null });

    await store.cart.getCart();
    await store.cart.getCart();

    expect(shop.calls[0]!.headers.get('authorization')).toBeNull();
    expect(shop.calls[1]!.headers.get('authorization')).toBe('Bearer session-token-1');
    expect(await session.get()).toBe('session-token-1');
  });

  it('adopts a new token when the server rotates it', async () => {
    const session = memorySession('old-token');
    const store = commerce(session);
    shop.issueToken = 'new-token';
    shop.on('ActiveOrder', { activeOrder: null });

    await store.cart.getCart();

    expect(shop.calls[0]!.headers.get('authorization')).toBe('Bearer old-token');
    expect(await session.get()).toBe('new-token');
  });

  it('keeps two stores apart: each client has its own session and channel token', async () => {
    const a = createCommerce({ apiUrl: API_URL, channelToken: 'store-a' });
    const b = createCommerce({ apiUrl: API_URL, channelToken: 'store-b' });
    shop.issueToken = 'token-for-a';
    shop.on('ActiveOrder', { activeOrder: null });

    await a.cart.getCart();
    shop.issueToken = undefined;
    await b.cart.getCart();

    expect(shop.calls[1]!.headers.get('vendure-token')).toBe('store-b');
    expect(shop.calls[1]!.headers.get('authorization')).toBeNull();
  });

  it('refuses to be created without an API URL or a channel token', () => {
    expect(() => createCommerce({ apiUrl: '', channelToken: 'x' })).toThrow(/apiUrl/);
    expect(() => createCommerce({ apiUrl: API_URL, channelToken: '' })).toThrow(/channelToken/);
  });
});

describe('errors', () => {
  it('turns an ErrorResult into a CommerceError with its code and message', async () => {
    shop.on('AddItem', {
      addItemToOrder: {
        __typename: 'InsufficientStockError',
        errorCode: 'INSUFFICIENT_STOCK_ERROR',
        message: 'Only 2 items were added to the order due to insufficient stock',
        quantityAvailable: 2,
      },
    });

    const failure = await commerce()
      .cart.addToCart('v1', 5)
      .catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(CommerceError);
    expect(failure).toMatchObject({
      code: 'INSUFFICIENT_STOCK_ERROR',
      message: expect.stringContaining('insufficient stock'),
      details: { quantityAvailable: 2 },
    });
  });

  it('uses the reason as the code of Mercado Pago errors', async () => {
    shop.on('ActiveOrder', { activeOrder: order({ state: 'ArrangingPayment' }) });
    shop.on('CreateMercadoPagoCheckout', {
      createMercadoPagoCheckout: {
        __typename: 'MercadoPagoError',
        errorCode: 'MERCADOPAGO_ERROR',
        message: 'This store cannot take payments right now.',
        reason: 'NOT_CONNECTED',
      },
    });

    const failure = await commerce()
      .checkout.startPayment({ successUrl: 'a', failureUrl: 'b', pendingUrl: 'c' })
      .catch((e: unknown) => e);

    expect(failure).toMatchObject({ code: 'NOT_CONNECTED' });
  });

  it('reports GraphQL errors', async () => {
    shop.on('ActiveOrder', { __graphqlError: 'Query is too complex' });

    await expect(commerce().cart.getCart()).rejects.toMatchObject({
      name: 'CommerceError',
      code: 'GRAPHQL_ERROR',
      message: 'Query is too complex',
    });
  });

  it('reports an unreachable server', async () => {
    shop.on('ActiveOrder', () => HttpResponse_networkError());

    await expect(commerce().cart.getCart()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('reports an HTTP failure with no GraphQL body', async () => {
    shop.on('ActiveOrder', () => new Response('Bad gateway', { status: 502 }));

    await expect(commerce().cart.getCart()).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      details: { status: 502 },
    });
  });
});

function HttpResponse_networkError(): Response {
  return Response.error();
}
