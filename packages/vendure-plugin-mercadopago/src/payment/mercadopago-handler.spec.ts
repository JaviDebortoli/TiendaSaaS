import type { Order, RequestContext } from '@vendure/core';
import { describe, expect, it } from 'vitest';
import type { MercadoPagoAccount } from '../entities/mercadopago-account.entity';
import type { MercadoPagoPayment } from '../services/mercadopago-api.service';
import { runAsSettlement, Settlement } from '../settlement-scope';
import { mercadoPagoHandler } from './mercadopago-handler';

const ctx = {} as RequestContext;
const order = (id: number, totalWithTax = 12_300) =>
  ({ id, code: `ORDER${id}`, totalWithTax, currencyCode: 'ARS' }) as Order;

const verified = (orderId: number, mpPaymentId = '99'): Settlement => ({
  orderId,
  mpPaymentId,
  payment: {
    id: Number(mpPaymentId),
    status: 'approved',
    transaction_amount: 123,
    currency_id: 'ARS',
    external_reference: 'ORDER5-REF',
    collector_id: 1,
  } as MercadoPagoPayment,
  account: { mpUserId: '1' } as MercadoPagoAccount,
  externalReference: 'ORDER5-REF',
});

const createPayment = (target: Order, amount: number, mpPaymentId: string | undefined) =>
  mercadoPagoHandler.createPayment(
    ctx,
    target,
    amount,
    [],
    mpPaymentId === undefined ? {} : { mpPaymentId },
    undefined as never,
  );

const REFUSED = /payment processor/;

describe('the Mercado Pago handler only adds what the processor verified (PRD 9.5)', () => {
  it('refuses a call outside the settlement scope, whatever it carries', async () => {
    await expect(createPayment(order(5), 12_300, '99')).rejects.toThrow(REFUSED);
    await expect(createPayment(order(5), 12_300, undefined)).rejects.toThrow(REFUSED);
  });

  it('settles inside the scope without asking Mercado Pago, keeping the evidence', async () => {
    const result = await runAsSettlement(verified(5), () => createPayment(order(5), 12_300, '99'));

    expect(result).toMatchObject({
      state: 'Settled',
      transactionId: '99',
      amount: 12_300,
      metadata: { mpAccountUserId: '1', mpCollectorId: 1, mpStatus: 'approved' },
    });
  });

  it('does not let the scope of one order serve another order', async () => {
    await runAsSettlement(verified(5), async () => {
      await expect(createPayment(order(6), 12_300, '99')).rejects.toThrow(REFUSED);
    });
  });

  it('does not let the scope of one payment serve another payment', async () => {
    await runAsSettlement(verified(5, '99'), async () => {
      await expect(createPayment(order(5), 12_300, '100')).rejects.toThrow(REFUSED);
      await expect(createPayment(order(5), 12_300, undefined)).rejects.toThrow(REFUSED);
    });
  });

  it('still refuses, inside the scope, an amount or an order total that no longer matches the payment', async () => {
    await runAsSettlement(verified(5), async () => {
      expect(await createPayment(order(5), 5_000, '99')).toMatchObject({ state: 'Error' });
      expect(await createPayment(order(5, 20_000), 20_000, '99')).toMatchObject({
        state: 'Error',
        errorMessage: expect.stringContaining('does not match'),
      });
    });
  });
});
