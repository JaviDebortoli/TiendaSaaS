import { ID, VendureEvent } from '@vendure/core';

export type AttentionReason =
  /** The access token could not be renewed. The store has to link its account again. */
  | 'token_renewal_failed'
  /** The store revoked the application's access from Mercado Pago. */
  | 'account_disconnected'
  /** Approved payment whose amount differs from the order total (PRD 9.8). */
  | 'amount_mismatch'
  /** Approved payment for an order that can no longer be paid (state changed during payment). */
  | 'order_not_payable'
  /** Payment refunded, charged back or in mediation on Mercado Pago's side. */
  | 'payment_reversed';

/**
 * Something needs a person: a store owner or the superadmin. The plugin only publishes the event
 * and writes an order note; the application decides how to notify (for example by email).
 */
export class MercadoPagoAttentionEvent extends VendureEvent {
  constructor(
    public readonly reason: AttentionReason,
    public readonly channelId: ID,
    public readonly details: {
      orderCode?: string;
      mpPaymentId?: string;
      message?: string;
    } = {},
  ) {
    super();
  }
}
