import { ID } from '@vendure/core';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { MercadoPagoAccount } from './entities/mercadopago-account.entity';
import type { MercadoPagoPayment } from './services/mercadopago-api.service';

/** A payment the processor already verified against Mercado Pago, for one order. */
export interface Settlement {
  orderId: ID;
  mpPaymentId: string;
  /** The payment as Mercado Pago reported it. */
  payment: MercadoPagoPayment;
  /** The account whose token read it. */
  account: MercadoPagoAccount;
  /** The reference of the preference that was issued for the order. */
  externalReference: string;
}

const scope = new AsyncLocalStorage<Settlement>();

/**
 * Runs `fn` as the settlement of an approved payment that was already verified against Mercado
 * Pago. Inside it the payment method counts as eligible for that order even if the store no longer
 * sells with Mercado Pago (it unlinked its account, or changed to another one): money that was
 * taken for an order is applied to it whatever the store offers today (PRD 9.4). Buyers never run
 * in this scope, so the method is still hidden from new checkouts.
 *
 * The scope is also the only way the handler adds the payment (PRD 9.5): it carries the verified
 * payment, tied to the exact order and payment id that were checked, so `createPayment` does not
 * ask Mercado Pago again and a call that comes from anywhere else is refused without asking at all.
 */
export function runAsSettlement<T>(settlement: Settlement, fn: () => Promise<T>): Promise<T> {
  return scope.run(settlement, fn);
}

export function isSettling(orderId: ID): boolean {
  const current = scope.getStore();
  return current !== undefined && String(current.orderId) === String(orderId);
}

/**
 * The verified payment, only when the scope is open for exactly this order and this payment id. A
 * scope for one order never serves another order or another payment.
 */
export function verifiedSettlement(orderId: ID, mpPaymentId: string): Settlement | undefined {
  const current = scope.getStore();
  if (!current) return undefined;
  return String(current.orderId) === String(orderId) && current.mpPaymentId === mpPaymentId
    ? current
    : undefined;
}
