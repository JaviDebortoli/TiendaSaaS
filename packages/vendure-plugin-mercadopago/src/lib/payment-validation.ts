import { amountMatchesTotal } from './amounts';

export interface PaymentFacts {
  id?: number | string;
  status?: string;
  transaction_amount?: number;
  currency_id?: string;
  external_reference?: string | null;
}

export interface OrderFacts {
  /** The `external_reference` the platform issued for the order's preference (PRD 9.6). */
  externalReference: string;
  totalWithTax: number;
  currencyCode: string;
}

export type PaymentValidation =
  | { ok: true }
  | { ok: false; reason: 'reference_mismatch' | 'currency_mismatch' | 'amount_mismatch' };

/**
 * Checks that a payment fetched from Mercado Pago really carries the reference the platform issued
 * for the order and covers it (PRD 9.7): same `external_reference`, ARS, and an amount equal to
 * `totalWithTax`. Whether that reference was really issued, and for the payment's own preference,
 * is decided apart (see `checkIssuance`).
 */
export function validatePaymentAgainstOrder(
  payment: PaymentFacts,
  order: OrderFacts,
): PaymentValidation {
  if (payment.external_reference !== order.externalReference) {
    return { ok: false, reason: 'reference_mismatch' };
  }
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
