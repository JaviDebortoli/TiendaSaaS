import { describe, expect, it } from 'vitest';
import type { MercadoPagoAccount } from './entities/mercadopago-account.entity';
import type { MercadoPagoPayment } from './services/mercadopago-api.service';
import { isSettling, runAsSettlement, Settlement, verifiedSettlement } from './settlement-scope';

const scopeFor = (orderId: number | string, mpPaymentId = '99'): Settlement => ({
  orderId,
  mpPaymentId,
  payment: { id: Number(mpPaymentId) } as MercadoPagoPayment,
  account: { mpUserId: '1' } as MercadoPagoAccount,
  externalReference: 'REF',
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('settlement scope', () => {
  it('is closed outside a settlement', () => {
    expect(isSettling(1)).toBe(false);
  });

  it('opens only for the order being settled, inside the callback', async () => {
    await runAsSettlement(scopeFor(7), async () => {
      expect(isSettling(7)).toBe(true);
      expect(isSettling('7')).toBe(true); // ids compare as text, like the rest of the plugin
      expect(isSettling(8)).toBe(false);
      await tick();
      expect(isSettling(7)).toBe(true); // still open after async work
    });
  });

  it('closes when the callback ends, also when it fails', async () => {
    await runAsSettlement(scopeFor(7), async () => undefined);
    expect(isSettling(7)).toBe(false);

    await expect(
      runAsSettlement(scopeFor(7), async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(isSettling(7)).toBe(false);
  });

  it('does not leak to a concurrent request that is not settling', async () => {
    const seen: Record<string, boolean> = {};
    const settling = runAsSettlement(scopeFor(7), async () => {
      await tick();
      seen.settling = isSettling(7);
    });
    // A buyer's request running at the same time never sees the scope.
    await tick();
    seen.buyer = isSettling(7);
    await settling;

    expect(seen).toEqual({ settling: true, buyer: false });
  });

  it('keeps two settlements apart', async () => {
    const results = await Promise.all([
      runAsSettlement(scopeFor(1), async () => {
        await tick();
        return [isSettling(1), isSettling(2)];
      }),
      runAsSettlement(scopeFor(2), async () => {
        await tick();
        return [isSettling(1), isSettling(2)];
      }),
    ]);

    expect(results).toEqual([
      [true, false],
      [false, true],
    ]);
  });

  it('hands over the verified payment only for the exact order and payment id it was opened for', async () => {
    await runAsSettlement(scopeFor(7, '99'), async () => {
      expect(verifiedSettlement(7, '99')).toMatchObject({
        mpPaymentId: '99',
        externalReference: 'REF',
      });
      expect(verifiedSettlement('7', '99')).toBeDefined();
      // The scope of one order does not serve another order, nor another payment.
      expect(verifiedSettlement(8, '99')).toBeUndefined();
      expect(verifiedSettlement(7, '100')).toBeUndefined();
      expect(verifiedSettlement(7, '')).toBeUndefined();
    });
    expect(verifiedSettlement(7, '99')).toBeUndefined();
  });
});
