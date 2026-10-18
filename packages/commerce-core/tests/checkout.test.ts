import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCommerce, formatMoney } from '../src';
import { API_URL, CHANNEL_TOKEN, FakeShop, order } from './fake-shop';

const shop = new FakeShop();
beforeAll(() => shop.start());
afterAll(() => shop.stop());
beforeEach(() => shop.reset());

const store = () => createCommerce({ apiUrl: API_URL, channelToken: CHANNEL_TOKEN });
const urls = {
  successUrl: 'https://tienda.example.test/result?status=success',
  failureUrl: 'https://tienda.example.test/result?status=failure',
  pendingUrl: 'https://tienda.example.test/result?status=pending',
};

describe('cart', () => {
  it('returns null while there is no cart', async () => {
    shop.on('ActiveOrder', { activeOrder: null });

    expect(await store().cart.getCart()).toBeNull();
  });

  it('adds, changes and removes lines, returning the whole cart each time', async () => {
    shop.on('AddItem', { addItemToOrder: order({ totalQuantity: 2 }) });
    shop.on('AdjustLine', { adjustOrderLine: order({ totalQuantity: 5 }) });
    shop.on('RemoveLine', { removeOrderLine: order({ totalQuantity: 0 }) });
    const { cart } = store();

    expect((await cart.addToCart('v1', 2)).totalQuantity).toBe(2);
    expect((await cart.setLineQuantity('l1', 5)).totalQuantity).toBe(5);
    expect((await cart.setLineQuantity('l1', 0)).totalQuantity).toBe(0);

    expect(shop.called('AddItem')[0]!.variables).toEqual({ variantId: 'v1', quantity: 2 });
    expect(shop.called('AdjustLine')[0]!.variables).toEqual({ lineId: 'l1', quantity: 5 });
    expect(shop.called('RemoveLine')).toHaveLength(1);
  });

  it('applies a coupon with surrounding spaces trimmed', async () => {
    shop.on('ApplyCoupon', { applyCouponCode: order({ couponCodes: ['PROMO'] }) });

    await store().cart.applyCoupon('  PROMO ');

    expect(shop.called('ApplyCoupon')[0]!.variables).toEqual({ code: 'PROMO' });
  });

  it('reports a coupon the shop rejects', async () => {
    shop.on('ApplyCoupon', {
      applyCouponCode: {
        __typename: 'CouponCodeInvalidError',
        errorCode: 'COUPON_CODE_INVALID_ERROR',
        message: 'Coupon code "NOPE" is not valid',
      },
    });

    await expect(store().cart.applyCoupon('NOPE')).rejects.toMatchObject({
      code: 'COUPON_CODE_INVALID_ERROR',
    });
  });
});

describe('catalog', () => {
  it('limits page sizes so the server never refuses them as too complex', async () => {
    shop.on('Products', { products: { totalItems: 0, items: [] } });

    await store().catalog.listProducts({ take: 5000 });
    await store().catalog.listProducts({ take: 0, skip: -3 });

    const [first, second] = shop
      .called('Products')
      .map((c) => c.variables!.options as Record<string, number>);
    expect(first!.take).toBe(100);
    expect(second).toMatchObject({ take: 1, skip: 0 });
  });

  it('returns null for a product the store does not sell', async () => {
    shop.on('Product', { product: null });

    expect(await store().catalog.getProduct('nope')).toBeNull();
  });

  it('searches by text, collection and facets', async () => {
    shop.on('Search', { search: { totalItems: 0, items: [], facetValues: [] } });

    await store().catalog.searchProducts({
      term: ' pan ',
      collectionSlug: 'bakery',
      facetValueIds: ['3'],
    });

    expect(shop.called('Search')[0]!.variables!.input).toMatchObject({
      term: 'pan',
      collectionSlug: 'bakery',
      facetValueIds: ['3'],
      groupByProduct: true,
    });
  });
});

describe('checkout', () => {
  it('works for a guest: customer, address and delivery need no account', async () => {
    shop.on('SetCustomer', { setCustomerForOrder: order() });
    shop.on('SetShippingAddress', { setOrderShippingAddress: order() });
    shop.on('EligibleShippingMethods', {
      eligibleShippingMethods: [
        { id: '1', code: 'pickup', name: 'Pickup', description: '', price: 0, priceWithTax: 0 },
      ],
    });
    shop.on('SetShippingMethod', { setOrderShippingMethod: order() });
    const { checkout } = store();

    await checkout.setCustomer({
      email: ' ana@example.test ',
      firstName: ' Ana ',
      lastName: 'Pérez',
    });
    await checkout.setShippingAddress({
      fullName: 'Ana Pérez',
      streetLine1: 'Calle 1',
      city: 'Rosario',
      countryCode: 'AR',
    });
    const methods = await checkout.getShippingMethods();
    await checkout.selectShippingMethod(methods[0]!.id);

    expect(shop.called('SetCustomer')[0]!.variables!.input).toMatchObject({
      emailAddress: 'ana@example.test',
      firstName: 'Ana',
    });
    expect(shop.called('SetShippingMethod')[0]!.variables).toEqual({ ids: ['1'] });
  });

  it('offers only the payment methods that are eligible', async () => {
    shop.on('EligiblePaymentMethods', {
      eligiblePaymentMethods: [
        { code: 'mercado-pago', name: 'Mercado Pago', isEligible: false },
        { code: 'other', name: 'Other', isEligible: true },
      ],
    });

    expect((await store().checkout.getPaymentMethods()).map((m) => m.code)).toEqual(['other']);
  });

  describe('startPayment', () => {
    it('moves the order to payment and returns the Mercado Pago redirect', async () => {
      shop.on('ActiveOrder', { activeOrder: order({ state: 'AddingItems', code: 'ABC' }) });
      shop.on('TransitionOrder', { transitionOrderToState: order({ state: 'ArrangingPayment' }) });
      shop.on('CreateMercadoPagoCheckout', {
        createMercadoPagoCheckout: {
          __typename: 'MercadoPagoCheckout',
          preferenceId: 'pref-1',
          initPoint: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1',
          sandboxInitPoint: null,
          expiresAt: '2026-10-18T20:30:00.000Z',
        },
      });

      const started = await store().checkout.startPayment(urls);

      expect(started).toEqual({
        orderCode: 'ABC',
        redirectUrl: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1',
        preferenceId: 'pref-1',
        expiresAt: '2026-10-18T20:30:00.000Z',
      });
      expect(shop.called('TransitionOrder')[0]!.variables).toEqual({ state: 'ArrangingPayment' });
      expect(shop.called('CreateMercadoPagoCheckout')[0]!.variables).toEqual({
        input: { orderCode: 'ABC', ...urls },
      });
    });

    it('does not transition an order that is already waiting for payment', async () => {
      shop.on('ActiveOrder', { activeOrder: order({ state: 'ArrangingPayment' }) });
      shop.on('CreateMercadoPagoCheckout', {
        createMercadoPagoCheckout: {
          __typename: 'MercadoPagoCheckout',
          preferenceId: 'p',
          initPoint: 'https://mp.test/p',
          sandboxInitPoint: null,
          expiresAt: '2026-10-18T20:30:00.000Z',
        },
      });

      await store().checkout.startPayment(urls);

      expect(shop.called('TransitionOrder')).toHaveLength(0);
    });

    it('explains a delivery method that stopped being eligible (PRD V: Vendure 3.8 re-check)', async () => {
      shop.on('ActiveOrder', { activeOrder: order({ state: 'AddingItems' }) });
      shop.on('TransitionOrder', {
        transitionOrderToState: {
          __typename: 'OrderStateTransitionError',
          errorCode: 'ORDER_STATE_TRANSITION_ERROR',
          message: 'Cannot transition Order from "AddingItems" to "ArrangingPayment"',
          transitionError: 'The selected shipping method is no longer eligible',
          fromState: 'AddingItems',
          toState: 'ArrangingPayment',
        },
      });

      const failure = await store()
        .checkout.startPayment(urls)
        .catch((e: unknown) => e);

      expect(failure).toMatchObject({
        code: 'ORDER_STATE_TRANSITION_ERROR',
        details: { transitionError: 'The selected shipping method is no longer eligible' },
      });
      expect(shop.called('CreateMercadoPagoCheckout')).toHaveLength(0);
    });

    it('fails clearly when there is no cart', async () => {
      shop.on('ActiveOrder', { activeOrder: null });

      await expect(store().checkout.startPayment(urls)).rejects.toMatchObject({
        code: 'NO_ACTIVE_ORDER',
      });
    });
  });
});

describe('account', () => {
  it('registers, signs in and out, and forgets the session on logout', async () => {
    shop.on('Register', { registerCustomerAccount: { __typename: 'Success', success: true } });
    shop.on('Login', {
      login: { __typename: 'CurrentUser', id: '1', identifier: 'ana@example.test' },
    });
    shop.on('Logout', { logout: { success: true } });
    shop.issueToken = 'session-1';
    const { account } = store();

    await account.register({
      email: 'ana@example.test',
      password: 'secret-123',
      firstName: 'Ana',
      lastName: 'P',
    });
    await account.login('ana@example.test', 'secret-123');
    shop.issueToken = undefined;
    await account.logout();
    await account.login('ana@example.test', 'secret-123');

    // After logout the next call starts a fresh session, with no bearer token.
    expect(shop.calls.at(-1)!.headers.get('authorization')).toBeNull();
  });

  it('reports invalid credentials', async () => {
    shop.on('Login', {
      login: {
        __typename: 'InvalidCredentialsError',
        errorCode: 'INVALID_CREDENTIALS_ERROR',
        message: 'The provided credentials are invalid',
      },
    });

    await expect(store().account.login('a@b.test', 'wrong')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS_ERROR',
    });
  });

  it('answers an empty history for a guest', async () => {
    shop.on('CustomerOrders', { activeCustomer: null });

    expect(await store().account.listOrders()).toEqual({ totalItems: 0, items: [] });
  });
});

describe('formatMoney', () => {
  it('formats cents as Argentine pesos', () => {
    expect(formatMoney(129900).replace(/\s/g, ' ')).toBe('$ 1.299,00');
    expect(formatMoney(5).replace(/\s/g, ' ')).toBe('$ 0,05');
  });
});
