import { amountMatchesTotal } from './amounts';

export interface PaymentFacts {
  id?: number | string;
  status?: string;
  transaction_amount?: number;
  currency_id?: string;
  external_reference?: string | null;
}

export interface OrderFacts {
  code: string;
  totalWithTax: number;
  currencyCode: string;
}

export type PaymentValidation =
  | { ok: true }
  | { ok: false; reason: 'reference_mismatch' | 'currency_mismatch' | 'amount_mismatch' };

/**
 * Checks that a payment fetched from Mercado Pago really belongs to, and covers, the order
 * (PRD 9.7): same `external_reference`, ARS, and an amount equal to `totalWithTax`.
 */
export function validatePaymentAgainstOrder(
  payment: PaymentFacts,
  order: OrderFacts,
): PaymentValidation {
  if (payment.external_reference !== order.code) return { ok: false, reason: 'reference_mismatch' };
  if (payment.currency_id !== 'ARS' || order.currencyCode !== 'ARS') {
    return { ok: false, reason: 'currency_mismatch' };
  }
  if (
    typeof payment.transaction_amount !== 'number' ||
    !Number.isFinite(payment.transaction_amount) ||
    !amountMatchesTotal(payment.transaction_amount, order.totalWithTax)
  ) {
    return { ok: false, reason: 'amount_mismatch' };
  }
  return { ok: true };
}
