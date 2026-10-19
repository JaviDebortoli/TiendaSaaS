import { ID, VendureEvent } from '@vendure/core';

export type AttentionReason =
  /** The access token could not be renewed. The store has to link its account again. */
  | 'token_renewal_failed'
  /** The seller revoked the application's access from Mercado Pago. Affects every store using the account. */
  | 'account_disconnected'
  /** Approved payment whose amount differs from the order total (PRD 9.8). */
  | 'amount_mismatch'
  /** Approved payment for an order that can no longer be paid (state changed during payment). */
  | 'order_not_payable'
  /** Payment refunded, charged back or in mediation on Mercado Pago's side. */
  | 'payment_reversed'
  /** Approved payment whose `collector_id` is not the account that was asked for it (PRD 9.7). */
  | 'collector_mismatch'
  /** Approved payment that came without `collector_id`, so its account cannot be confirmed. */
  | 'collector_missing'
  /**
   * Approved payment whose reference is not one of the preferences the platform issued for the
   * order, or whose preference could not be found out (PRD 9.7).
   */
  | 'unknown_preference'
  /** Approved payment that belongs to another preference than the one issued for its reference. */
  | 'preference_mismatch'
  /** Informational: a retired account was released from the store and can no longer refund (PRD 9.4). */
  | 'link_released'
  /** An approved payment arrived for a released link: it was settled, but the release rule failed. */
  | 'released_link_payment'
  /** A notification could not be checked because no tokens are left for its account. */
  | 'unverifiable_payment';

/**
 * Something needs a person: a store owner or the superadmin. The plugin only publishes the event
 * and writes an order note; the application decides how to notify (for example by email).
 * `channelId` is null when no store can be told (an account nobody uses any more).
 */
export class MercadoPagoAttentionEvent extends VendureEvent {
  constructor(
    public readonly reason: AttentionReason,
    public readonly channelId: ID | null,
    public readonly details: {
      orderCode?: string;
      mpPaymentId?: string;
      /** `user_id` of the Mercado Pago account the event is about. */
      mpUserId?: string;
      message?: string;
    } = {},
  ) {
    super();
  }
}
