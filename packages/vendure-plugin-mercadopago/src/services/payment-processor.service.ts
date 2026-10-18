import { Injectable } from '@nestjs/common';
import {
  Channel,
  EventBus,
  ID,
  Logger,
  Order,
  OrderService,
  PaymentMethodService,
  RequestContext,
  RequestContextService,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core';
import { LessThan } from 'typeorm';
import { loggerCtx, MERCADOPAGO_HANDLER_CODE } from '../constants';
import { ClaimStatus, MercadoPagoPaymentClaim } from '../entities/mercadopago-payment-claim.entity';
import { AttentionReason, MercadoPagoAttentionEvent } from '../events';
import { isUniqueViolation } from '../lib/db';
import { validatePaymentAgainstOrder } from '../lib/payment-validation';
import { mapPaymentStatus, PaymentOutcome } from '../lib/status';
import { MercadoPagoConnectionService, MercadoPagoNotConnectedError } from './connection.service';
import {
  MercadoPagoApiError,
  MercadoPagoApiService,
  MercadoPagoPayment,
} from './mercadopago-api.service';

export type IgnoredReason =
  | 'unknown_seller'
  | 'seller_mismatch'
  | 'payment_not_found'
  | 'order_not_found'
  | 'order_mismatch'
  | 'not_connected';

export type ProcessResult =
  | { outcome: 'settled'; orderCode: string; orderState: string }
  | { outcome: 'already_settled'; orderCode: string; orderState: string }
  | {
      outcome: 'pending' | 'rejected' | 'cancelled' | 'reversed' | 'unknown';
      orderCode: string;
      orderState: string;
    }
  | { outcome: 'needs_review'; orderCode: string; orderState: string; reason: string }
  | { outcome: 'ignored'; reason: IgnoredReason };

export interface ProcessInput {
  mpPaymentId: string;
  /** Store known beforehand (sync mutation, `notification_url` with the channel in the path). */
  channelId?: ID;
  /** `user_id` of the notification. Used to find the store when `channelId` is not known. */
  mpUserId?: string;
  /** The order the caller expects the payment to belong to (sync mutation). */
  expectedOrderCode?: string;
}

/** A `processing` claim older than this belongs to a worker that died; it can be taken over. */
const STALE_CLAIM_MS = 5 * 60 * 1000;

const PAYMENT_ID_PATTERN = /^[0-9]{1,20}$/;

const PAYABLE_STATES = new Set(['ArrangingPayment', 'ArrangingAdditionalPayment']);

/**
 * Turns a Mercado Pago payment into the right change in Vendure (PRD 9.7, 9.8). The payment is
 * always fetched from Mercado Pago with the store's own token: a notification, or the parameters
 * of the redirect, only say *which* payment to look at and never what happened to it.
 */
@Injectable()
export class MercadoPagoPaymentProcessor {
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly connections: MercadoPagoConnectionService,
    private readonly api: MercadoPagoApiService,
    private readonly orderService: OrderService,
    private readonly paymentMethodService: PaymentMethodService,
    private readonly requestContextService: RequestContextService,
    private readonly eventBus: EventBus,
  ) {}

  private get claims() {
    return this.connection.rawConnection.getRepository(MercadoPagoPaymentClaim);
  }

  async process(input: ProcessInput): Promise<ProcessResult> {
    // The id ends up in a Mercado Pago URL path: only plain numeric ids are accepted.
    if (!PAYMENT_ID_PATTERN.test(input.mpPaymentId)) {
      return { outcome: 'ignored', reason: 'payment_not_found' };
    }

    // 1. Which store?
    const mpConnection = input.channelId
      ? await this.connections.findByChannelId(input.channelId)
      : input.mpUserId
        ? await this.connections.findByMpUserId(input.mpUserId)
        : null;
    if (!mpConnection) {
      Logger.warn(
        `Notification for payment ${input.mpPaymentId} ignored: no store is linked to the seller.`,
        loggerCtx,
      );
      return { outcome: 'ignored', reason: 'unknown_seller' };
    }
    if (input.mpUserId && input.mpUserId !== mpConnection.mpUserId) {
      Logger.warn(
        `Notification for payment ${input.mpPaymentId} ignored: seller ${input.mpUserId} does not match the store's account.`,
        loggerCtx,
      );
      return { outcome: 'ignored', reason: 'seller_mismatch' };
    }
    const channelId = mpConnection.channelId;

    // 2. Ask Mercado Pago, with the store's token. This is the source of truth.
    let payment: MercadoPagoPayment;
    try {
      const { accessToken } = await this.connections.getAccessToken(channelId);
      payment = await this.api.getPayment(accessToken, input.mpPaymentId);
    } catch (error) {
      if (error instanceof MercadoPagoNotConnectedError) {
        Logger.warn(`Payment ${input.mpPaymentId}: ${error.message}`, loggerCtx);
        return { outcome: 'ignored', reason: 'not_connected' };
      }
      if (error instanceof MercadoPagoApiError && error.kind === 'not_found') {
        return { outcome: 'ignored', reason: 'payment_not_found' };
      }
      throw error;
    }

    // 3. Which order? Only inside this store's channel.
    const ctx = await this.createContext(channelId);
    const orderCode = payment.external_reference ?? '';
    const order = orderCode
      ? await this.orderService.findOneByCode(ctx, orderCode, ['payments', 'customer'])
      : undefined;
    if (!order) {
      Logger.warn(
        `Payment ${input.mpPaymentId}: no order "${orderCode}" in channel ${channelId}.`,
        loggerCtx,
      );
      return { outcome: 'ignored', reason: 'order_not_found' };
    }
    if (input.expectedOrderCode && input.expectedOrderCode !== order.code) {
      return { outcome: 'ignored', reason: 'order_mismatch' };
    }

    const outcome = mapPaymentStatus(payment.status);
    if (outcome !== 'settle') {
      await this.record(ctx, order, payment, outcome);
      return { outcome, orderCode: order.code, orderState: order.state };
    }
    return this.settle(ctx, order, payment);
  }

  /**
   * Cancels a payment that is still `pending` or `in_process` on Mercado Pago (PRD 9.9), for a
   * payment that belongs to an order of the administrator's own channel.
   */
  async cancelPending(ctx: RequestContext, mpPaymentId: string): Promise<void> {
    if (!PAYMENT_ID_PATTERN.test(mpPaymentId)) throw new UserInputError('Invalid payment id.');
    const { accessToken } = await this.connections.getAccessToken(ctx.channelId);
    let payment: MercadoPagoPayment;
    try {
      payment = await this.api.getPayment(accessToken, mpPaymentId);
    } catch (error) {
      if (error instanceof MercadoPagoApiError && error.kind === 'not_found') {
        throw new UserInputError('Payment not found.');
      }
      throw error;
    }
    const order = payment.external_reference
      ? await this.orderService.findOneByCode(ctx, payment.external_reference)
      : undefined;
    if (!order) throw new UserInputError('The payment does not belong to an order of this store.');
    if (payment.status !== 'pending' && payment.status !== 'in_process') {
      throw new UserInputError(
        `Only pending or in-process payments can be cancelled (this one is ${payment.status}).`,
      );
    }
    await this.api.cancelPayment(accessToken, mpPaymentId);
    await this.addNote(ctx, order, `Mercado Pago payment ${mpPaymentId} was cancelled.`);
  }

  /** The id of the Vendure PaymentMethod that uses the Mercado Pago handler in this channel. */
  async findPaymentMethodCode(ctx: RequestContext): Promise<string | undefined> {
    const { items } = await this.paymentMethodService.findAll(ctx, {
      filter: { enabled: { eq: true } },
    });
    return items.find((method) => method.handler.code === MERCADOPAGO_HANDLER_CODE)?.code;
  }

  private async settle(
    ctx: RequestContext,
    order: Order,
    payment: MercadoPagoPayment,
  ): Promise<ProcessResult> {
    const mpPaymentId = String(payment.id);
    const orderCode = order.code;
    const base = { orderCode, orderState: order.state };

    // Duplicate notification for a payment that already settled the order: nothing to do.
    if (order.payments?.some((p) => p.transactionId === mpPaymentId)) {
      return { outcome: 'already_settled', ...base };
    }

    const validation = validatePaymentAgainstOrder(payment, {
      code: order.code,
      totalWithTax: order.totalWithTax,
      currencyCode: order.currencyCode,
    });
    if (!validation.ok) {
      // Money was taken for a different amount (for example the cart changed during payment).
      await this.markNeedsReview(ctx, order, mpPaymentId, 'amount_mismatch', validation.reason);
      return { outcome: 'needs_review', ...base, reason: validation.reason };
    }
    if (!PAYABLE_STATES.has(order.state)) {
      await this.markNeedsReview(ctx, order, mpPaymentId, 'order_not_payable', order.state);
      return { outcome: 'needs_review', ...base, reason: `order_state_${order.state}` };
    }

    const methodCode = await this.findPaymentMethodCode(ctx);
    if (!methodCode) {
      throw new Error(
        `Channel ${ctx.channel.code} has no enabled payment method with the "${MERCADOPAGO_HANDLER_CODE}" handler.`,
      );
    }

    // Exactly-once: only the worker that wins the claim adds the payment.
    if ((await this.claimForSettlement(ctx.channelId, mpPaymentId, orderCode)) === 'duplicate') {
      return { outcome: 'already_settled', ...base };
    }

    try {
      // Vendure 3.8 requires a transaction around addPaymentToOrder.
      const result = await this.connection.withTransaction(ctx, async (txCtx) => {
        // Payments of the same order are applied one at a time, so two different approved
        // payments racing for one order cannot both be added.
        await this.lockOrder(txCtx, order.id);
        return this.orderService.addPaymentToOrder(txCtx, order.id, {
          method: methodCode,
          metadata: { mpPaymentId },
        });
      });
      if ('errorCode' in result) {
        await this.setClaimStatus(mpPaymentId, 'recorded');
        if (result.errorCode === 'ORDER_PAYMENT_STATE_ERROR') {
          // Another payment settled the order first: money must go back, a person decides.
          await this.markNeedsReview(ctx, order, mpPaymentId, 'order_not_payable', 'already paid');
          return { outcome: 'needs_review', ...base, reason: 'order_not_payable' };
        }
        throw new Error(
          `Could not add Mercado Pago payment ${mpPaymentId} to order ${orderCode}: ${result.errorCode} ${result.message}`,
        );
      }
      await this.setClaimStatus(mpPaymentId, 'settled');
      return { outcome: 'settled', orderCode, orderState: result.state };
    } catch (error) {
      // Release the claim so a retry (or the sync mutation) can try again.
      await this.setClaimStatus(mpPaymentId, 'recorded', { onlyIf: 'processing' });
      throw error;
    }
  }

  /** Transaction-scoped advisory lock on the order. Only PostgreSQL needs (and supports) it. */
  private async lockOrder(ctx: RequestContext, orderId: ID): Promise<void> {
    if (this.connection.rawConnection.options.type !== 'postgres') return;
    await this.connection
      .getRepository(ctx, Order)
      .query('SELECT pg_advisory_xact_lock(hashtext($1))', [`mp-order:${orderId}`]);
  }

  /**
   * Inserts the claim, or takes over an existing one that is only `recorded` (a pending payment
   * that was approved later) or `processing` by a worker that died.
   */
  private async claimForSettlement(
    channelId: ID,
    mpPaymentId: string,
    orderCode: string,
  ): Promise<'claimed' | 'duplicate'> {
    const now = new Date();
    try {
      await this.claims.save(
        this.claims.create({
          mpPaymentId,
          channelId,
          orderCode,
          status: 'processing',
          lastStatus: 'approved',
          claimedAt: now,
          note: null,
        }),
      );
      return 'claimed';
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const fromRecorded = await this.claims.update(
      { mpPaymentId, status: 'recorded' },
      { status: 'processing', lastStatus: 'approved', claimedAt: now },
    );
    if (fromRecorded.affected) return 'claimed';
    const stale = await this.claims.update(
      {
        mpPaymentId,
        status: 'processing',
        claimedAt: LessThan(new Date(now.getTime() - STALE_CLAIM_MS)),
      },
      { claimedAt: now },
    );
    return stale.affected ? 'claimed' : 'duplicate';
  }

  private async setClaimStatus(
    mpPaymentId: string,
    status: ClaimStatus,
    options: { onlyIf?: ClaimStatus } = {},
  ): Promise<void> {
    await this.claims.update(
      options.onlyIf ? { mpPaymentId, status: options.onlyIf } : { mpPaymentId },
      { status },
    );
  }

  /** Notes a non-settling status once per status, and alerts when money went back. */
  private async record(
    ctx: RequestContext,
    order: Order,
    payment: MercadoPagoPayment,
    outcome: Exclude<PaymentOutcome, 'settle'>,
  ): Promise<void> {
    const mpPaymentId = String(payment.id);
    const status = payment.status ?? 'unknown';
    const row = await this.claims.findOneBy({ mpPaymentId });
    if (row?.status === 'processing' && outcome !== 'reversed') return;
    if (row?.lastStatus === status) return;

    try {
      if (row) {
        await this.claims.update({ id: row.id }, { lastStatus: status });
      } else {
        await this.claims.save(
          this.claims.create({
            mpPaymentId,
            channelId: ctx.channelId,
            orderCode: order.code,
            status: 'recorded',
            lastStatus: status,
            claimedAt: new Date(),
            note: null,
          }),
        );
      }
    } catch (error) {
      if (isUniqueViolation(error)) return; // a concurrent notification recorded it first
      throw error;
    }

    const detail = payment.status_detail ? ` (${payment.status_detail})` : '';
    await this.addNote(ctx, order, `Mercado Pago payment ${mpPaymentId}: ${status}${detail}.`);
    if (outcome === 'reversed') {
      this.eventBus.publish(
        new MercadoPagoAttentionEvent('payment_reversed', ctx.channelId, {
          orderCode: order.code,
          mpPaymentId,
          message: `Payment ${status}${detail}`,
        }),
      );
    }
  }

  /** Approved money that cannot settle the order automatically: a person decides (PRD 9.8). */
  private async markNeedsReview(
    ctx: RequestContext,
    order: Order,
    mpPaymentId: string,
    reason: AttentionReason,
    detail: string,
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

    const message =
      reason === 'amount_mismatch'
        ? `Approved Mercado Pago payment ${mpPaymentId} does not match the order total (${detail}). It was not added to the order: review it and refund if needed.`
        : `Approved Mercado Pago payment ${mpPaymentId} arrived but the order is ${detail}. It was not added to the order: review it and refund if needed.`;
    await this.addNote(ctx, order, message);
    this.eventBus.publish(
      new MercadoPagoAttentionEvent(reason, ctx.channelId, {
        orderCode: order.code,
        mpPaymentId,
        message,
      }),
    );
  }

  private async addNote(ctx: RequestContext, order: Order, note: string): Promise<void> {
    await this.orderService.addNoteToOrder(ctx, { id: order.id, note, isPublic: false });
  }

  private async createContext(channelId: ID): Promise<RequestContext> {
    const channel = await this.connection.rawConnection
      .getRepository(Channel)
      .findOneByOrFail({ id: channelId });
    // Passing the token (not the bare entity) makes Vendure load the channel with its tax zones.
    return this.requestContextService.create({ apiType: 'admin', channelOrToken: channel.token });
  }
}
