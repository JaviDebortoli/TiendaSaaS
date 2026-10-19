import { ID } from '@vendure/core';
import { AsyncLocalStorage } from 'node:async_hooks';

const scope = new AsyncLocalStorage<{ orderId: ID }>();

/**
 * Runs `fn` as the settlement of an approved payment that was already verified against Mercado
 * Pago. Inside it the payment method counts as eligible for that order even if the store no longer
 * sells with Mercado Pago (it unlinked its account, or changed to another one): money that was
 * taken for an order is applied to it whatever the store offers today (PRD 9.4). Buyers never run
 * in this scope, so the method is still hidden from new checkouts.
 */
export function runAsSettlement<T>(orderId: ID, fn: () => Promise<T>): Promise<T> {
  return scope.run({ orderId }, fn);
}

export function isSettling(orderId: ID): boolean {
  const current = scope.getStore();
  return current !== undefined && String(current.orderId) === String(orderId);
}
