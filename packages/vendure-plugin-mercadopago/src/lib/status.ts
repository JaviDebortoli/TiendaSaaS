/**
 * Mapping of Mercado Pago payment statuses to what the plugin does with the order (PRD 9.8).
 * Statuses documented for the Payments API: pending, approved, authorized, in_process,
 * in_mediation, rejected, cancelled, refunded, charged_back.
 */
export type PaymentOutcome =
  /** Add the payment to the order (it becomes PaymentSettled). */
  | 'settle'
  /** Waiting for the buyer (cash vouchers, review). Record only; the order stays in ArrangingPayment. */
  | 'pending'
  /** Rejected. The order stays in ArrangingPayment and the buyer can retry. */
  | 'rejected'
  /** Cancelled or expired. Same handling as rejected. */
  | 'cancelled'
  /** Refunded, charged back or in mediation. Record and notify the store; no automatic state change. */
  | 'reversed'
  /** A status this version does not know. Record and ignore. */
  | 'unknown';

const OUTCOMES: Record<string, PaymentOutcome> = {
  approved: 'settle',
  pending: 'pending',
  in_process: 'pending',
  // Authorized means "waiting for capture". Checkout Pro captures on approval, so it is not expected.
  authorized: 'pending',
  rejected: 'rejected',
  cancelled: 'cancelled',
  refunded: 'reversed',
  charged_back: 'reversed',
  in_mediation: 'reversed',
};

export function mapPaymentStatus(status: string | undefined | null): PaymentOutcome {
  return (status && OUTCOMES[status]) || 'unknown';
}
