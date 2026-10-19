import { Injectable } from '@nestjs/common';
import {
  EventBus,
  Order,
  OrderService,
  RequestContext,
  TransactionalConnection,
} from '@vendure/core';
import { MercadoPagoPaymentClaim } from '../entities/mercadopago-payment-claim.entity';
import { AttentionReason, MercadoPagoAttentionEvent } from '../events';
import { isUniqueViolation } from '../lib/db';

/** Reasons a payment that Mercado Pago approved ends up waiting for a person. */
export type ReviewReason = Extract<
  AttentionReason,
  | 'amount_mismatch'
  | 'order_not_payable'
  | 'collector_mismatch'
  | 'collector_missing'
  | 'unknown_preference'
  | 'preference_mismatch'
>;

function reviewMessage(
  reason: ReviewReason,
  mpPaymentId: string,
  detail: string,
  observed?: string | number,
): string {
  const prefix = `Approved Mercado Pago payment ${mpPaymentId}`;
  switch (reason) {
    case 'amount_mismatch':
      return `${prefix} does not match the order total (${detail}). It was not added to the order: review it and refund if needed.`;
    case 'collector_mismatch':
      return `${prefix} was read with the token of Mercado Pago account ${detail}, but Mercado Pago says account ${observed ?? '(unknown)'} collected it. It was not added to the order: review it in Mercado Pago and refund if needed.`;
    case 'unknown_preference':
      return `${prefix} does not belong to a preference this platform issued for the order: ${detail}. It was not added to the order: review it in Mercado Pago and refund if needed.`;
    case 'preference_mismatch':
      return `${prefix} belongs to preference ${observed ?? '(unknown)'}, not to the one the platform issued for its reference (${detail}). It was not added to the order: review it in Mercado Pago and refund if needed.`;
    case 'collector_missing':
      return `${prefix} was read with the token of Mercado Pago account ${detail}, but Mercado Pago did not say which account collected it. It was not added to the order: review it in Mercado Pago and refund if needed.`;
    default:
      return `${prefix} arrived but the order is ${detail}. It was not added to the order: review it and refund if needed.`;
  }
}

/**
 * Approved money that cannot settle the order automatically: a person decides (PRD 9.8). Records
 * the claim as `needs_review`, notes the order and alerts the store (and, for the reasons that
 * concern the platform, the superadmin).
 */
@Injectable()
export class MercadoPagoReviewService {
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly orderService: OrderService,
    private readonly eventBus: EventBus,
  ) {}

  private get claims() {
    return this.connection.rawConnection.getRepository(MercadoPagoPaymentClaim);
  }

  async markNeedsReview(
    ctx: RequestContext,
    order: Order,
    mpPaymentId: string,
    reason: ReviewReason,
    detail: string,
    /** The `collector_id` Mercado Pago reported, kept in the note as evidence for V19. */
    observed?: string | number,
  ): Promise<void> {
    const row = await this.claims.findOneBy({ mpPaymentId });
    if (row && (row.status === 'processing' || row.status === 'settled')) return;
    if (row?.status === 'needs_review' && row.note === `${reason}:${detail}`) return; // already alerted

    try {
      if (row) {
        await this.claims.update(
          { id: row.id },
          { status: 'needs_review', lastStatus: 'approved', note: `${reason}:${detail}` },
        );
      } else {
        await this.claims.save(
          this.claims.create({
            mpPaymentId,
            channelId: ctx.channelId,
            orderCode: order.code,
            status: 'needs_review',
            lastStatus: 'approved',
            claimedAt: new Date(),
            note: `${reason}:${detail}`,
          }),
        );
      }
    } catch (error) {
      if (isUniqueViolation(error)) return;
      throw error;
    }

    const message = reviewMessage(reason, mpPaymentId, detail, observed);
    await this.orderService.addNoteToOrder(ctx, { id: order.id, note: message, isPublic: false });
    this.eventBus.publish(
      new MercadoPagoAttentionEvent(reason, ctx.channelId, {
        orderCode: order.code,
        mpPaymentId,
        message,
        ...(reason === 'collector_mismatch' || reason === 'collector_missing'
          ? { mpUserId: detail }
          : {}),
      }),
    );
  }
}
