import { describe, expect, it } from 'vitest';
import { validatePaymentAgainstOrder } from './payment-validation';

const order = { code: 'ORD-1', totalWithTax: 1999, currencyCode: 'ARS' };
const payment = {
  id: 1,
  status: 'approved',
  transaction_amount: 19.99,
  currency_id: 'ARS',
  external_reference: 'ORD-1',
};

describe('validatePaymentAgainstOrder', () => {
  it('accepts a payment that matches reference, currency and amount', () => {
    expect(validatePaymentAgainstOrder(payment, order)).toEqual({ ok: true });
  });

  it('rejects a payment for another order', () => {
    expect(validatePaymentAgainstOrder({ ...payment, external_reference: 'ORD-2' }, order)).toEqual(
      {
        ok: false,
        reason: 'reference_mismatch',
      },
    );
    expect(validatePaymentAgainstOrder({ ...payment, external_reference: null }, order).ok).toBe(
      false,
    );
  });

  it('rejects any other currency', () => {
    expect(validatePaymentAgainstOrder({ ...payment, currency_id: 'USD' }, order)).toEqual({
      ok: false,
      reason: 'currency_mismatch',
    });
    expect(validatePaymentAgainstOrder(payment, { ...order, currencyCode: 'USD' }).ok).toBe(false);
  });

  it.each([19.98, 20, 0, 1999, undefined])('rejects an amount of %s for a 1999 total', (amount) => {
    expect(validatePaymentAgainstOrder({ ...payment, transaction_amount: amount }, order)).toEqual({
      ok: false,
      reason: 'amount_mismatch',
    });
  });

  it('rejects when the order total changed after the payment was created', () => {
    expect(validatePaymentAgainstOrder(payment, { ...order, totalWithTax: 2999 }).ok).toBe(false);
  });
});
