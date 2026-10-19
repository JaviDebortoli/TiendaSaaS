import { Injectable } from '@nestjs/common';
import { DEFAULT_CHANNEL_CODE } from '@vendure/common/lib/shared-constants';
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
import { MercadoPagoAccount } from '../entities/mercadopago-account.entity';
import { MercadoPagoChannelLink } from '../entities/mercadopago-channel-link.entity';
import { ClaimStatus, MercadoPagoPaymentClaim } from '../entities/mercadopago-payment-claim.entity';
import { MercadoPagoAttentionEvent } from '../events';
import { isUniqueViolation } from '../lib/db';
import { runAsSettlement } from '../settlement-scope';
import { validatePaymentAgainstOrder } from '../lib/payment-validation';
import { mapPaymentStatus, PaymentOutcome } from '../lib/status';
import { MercadoPagoConnectionService, MercadoPagoNotConnectedError } from './connection.service';
import { MercadoPagoPayment } from './mercadopago-api.service';
import { FoundPayment, MercadoPagoPaymentOperations } from './payment-operations.service';
import { MercadoPagoReviewService } from './review.service';

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
  /**
   * Store known beforehand (sync mutation, `notification_url` with the channel in the path). The
   * order must belong to it, and only the accounts it has used (`active` or `retired` links) are
   * tried.
   */
  channelId?: ID;
  /**
   * `user_id` of the notification. Identifies the account when `channelId` is not known, and
   * narrows the accounts to try when it is.
   */
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
 * always fetched from Mercado Pago with the token of the account that collected it: a
 * notification, or the parameters of the redirect, only say *which* payment to look at and never
 * what happened to it. The order, and so the store, comes from the payment's own
 * `external_reference`, never from the account.
 */
@Injectable()
export class MercadoPagoPaymentProcessor {
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly connections: MercadoPagoConnectionService,
    private readonly operations: MercadoPagoPaymentOperations,
    private readonly reviews: MercadoPagoReviewService,
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

    // 1. Which accounts can have collected it?
    const candidates = await this.candidateAccounts(input);
    if ('ignored' in candidates) return candidates.ignored;

    // 2. Ask Mercado Pago, with the account's token. This is the source of truth.
    let found: FoundPayment | null;
    try {
      found = await this.operations.findPayment(candidates.accounts, input.mpPaymentId);
    } catch (error) {
      if (error instanceof MercadoPagoNotConnectedError) {
        Logger.warn(`Payment ${input.mpPaymentId}: ${error.message}`, loggerCtx);
        return { outcome: 'ignored', reason: 'not_connected' };
      }
      throw error;
    }
    if (!found) return { outcome: 'ignored', reason: 'payment_not_found' };
    const { payment, account } = found;

    // 3. Which order? Anywhere on the server: the order code is unique, and its channel is the store.
    const orderCode = payment.external_reference ?? '';
    const orderChannelId = await this.findOrderChannel(orderCode);
    if (orderChannelId === undefined) {
      Logger.warn(`Payment ${input.mpPaymentId}: no order "${orderCode}" in any store.`, loggerCtx);
      return { outcome: 'ignored', reason: 'order_not_found' };
    }
    if (input.channelId !== undefined && String(orderChannelId) !== String(input.channelId)) {
      Logger.warn(
        `Payment ${input.mpPaymentId}: order "${orderCode}" belongs to another store than the one it was notified for.`,
        loggerCtx,
      );
      return { outcome: 'ignored', reason: 'order_mismatch' };
    }

    // 4. The store must have used the account that collected the payment.
    const link = await this.connections.findLink(orderChannelId, account.id);
    if (!link) {
      Logger.warn(
        `Payment ${input.mpPaymentId} ignored: store ${orderChannelId} never used account ${account.mpUserId}.`,
        loggerCtx,
      );
      return { outcome: 'ignored', reason: 'seller_mismatch' };
    }

    const ctx = await this.createContext(orderChannelId);
    const order = await this.orderService.findOneByCode(ctx, orderCode, ['payments', 'customer']);
    if (!order) {
      Logger.warn(
        `Payment ${input.mpPaymentId}: no order "${orderCode}" in channel ${orderChannelId}.`,
        loggerCtx,
      );
      return { outcome: 'ignored', reason: 'order_not_found' };
    }
    if (input.expectedOrderCode && input.expectedOrderCode !== order.code) {
      return { outcome: 'ignored', reason: 'order_mismatch' };
    }

    const outcome = mapPaymentStatus(payment.status);
    if (outcome !== 'settle') {
      if (!found.collector.ok) {
        // Only settling is refused for a collector problem (settle() below). A pending, rejected or
        // reversed payment is recorded as always, so a chargeback alert is never lost; the log keeps
        // the evidence V19 needs.
        Logger.warn(
          `Payment ${input.mpPaymentId} (${payment.status ?? 'unknown'}): ${found.collector.reason} (read with account ${account.mpUserId}, collector_id ${payment.collector_id ?? 'absent'}).`,
          loggerCtx,
        );
      }
      await this.record(ctx, order, payment, outcome);
      return { outcome, orderCode: order.code, orderState: order.state };
    }
    return this.settle(ctx, order, found, link);
  }

  /**
   * Cancels a payment that is still `pending` or `in_process` on Mercado Pago (PRD 9.9), for a
   * payment that belongs to an order of the administrator's own channel. The accounts tried are
   * those the store sells with or used to sell with.
   */
  async cancelPending(ctx: RequestContext, mpPaymentId: string): Promise<void> {
    if (!PAYMENT_ID_PATTERN.test(mpPaymentId)) throw new UserInputError('Invalid payment id.');
    const accounts = await this.connections.accountsForChannel(ctx.channelId);
    const found = await this.operations.findPayment(accounts, mpPaymentId);
    if (!found) throw new UserInputError('Payment not found.');
    if (!found.collector.ok) {
      throw new UserInputError('The payment was not collected by an account of this store.');
    }
    const { payment, account } = found;
    const order = payment.external_reference
      ? await this.orderService.findOneByCode(ctx, payment.external_reference)
      : undefined;
    if (!order) throw new UserInputError('The payment does not belong to an order of this store.');
    if (payment.status !== 'pending' && payment.status !== 'in_process') {
      throw new UserInputError(
        `Only pending or in-process payments can be cancelled (this one is ${payment.status}).`,
      );
    }
    const result = await this.operations.cancel(ctx, mpPaymentId, account.mpUserId);
    if (!result.ok) throw new UserInputError(result.message);
    await this.addNote(ctx, order, `Mercado Pago payment ${mpPaymentId} was cancelled.`);
  }

  /** The id of the Vendure PaymentMethod that uses the Mercado Pago handler in this channel. */
  async findPaymentMethodCode(ctx: RequestContext): Promise<string | undefined> {
    const { items } = await this.paymentMethodService.findAll(ctx, {
      filter: { enabled: { eq: true } },
    });
    return items.find((method) => method.handler.code === MERCADOPAGO_HANDLER_CODE)?.code;
  }

  /**
   * The accounts that may have collected the payment. With a known store, those it sells with or
   * used to sell with, narrowed to the notification's `user_id` when there is one. Without it, the
   * account the notification names, which must still hold tokens: with none, the payment cannot be
   * checked, and the platform is told instead of discarding it silently.
   */
  private async candidateAccounts(
    input: ProcessInput,
  ): Promise<{ accounts: MercadoPagoAccount[] } | { ignored: ProcessResult }> {
    if (input.channelId !== undefined) {
      let accounts = await this.connections.accountsForChannel(input.channelId);
      if (input.mpUserId) {
        const narrowed = accounts.filter((account) => account.mpUserId === input.mpUserId);
        if (narrowed.length === 0 && accounts.length > 0) {
          Logger.warn(
            `Notification for payment ${input.mpPaymentId} ignored: seller ${input.mpUserId} is not an account of store ${input.channelId}.`,
            loggerCtx,
          );
          return { ignored: { outcome: 'ignored', reason: 'seller_mismatch' } };
        }
        accounts = narrowed;
      }
      if (accounts.length === 0) {
        Logger.warn(
          `Notification for payment ${input.mpPaymentId} ignored: store ${input.channelId} has no Mercado Pago account.`,
          loggerCtx,
        );
        return { ignored: { outcome: 'ignored', reason: 'unknown_seller' } };
      }
      return { accounts };
    }

    const account = input.mpUserId
      ? await this.connections.findAccountByMpUserId(input.mpUserId)
      : null;
    if (!this.connections.hasTokens(account)) {
      Logger.warn(
        `Notification for payment ${input.mpPaymentId} ignored: ${account ? 'the account has no tokens left' : 'no account matches the seller'}.`,
        loggerCtx,
      );
      this.eventBus.publish(
        new MercadoPagoAttentionEvent('unverifiable_payment', null, {
          mpPaymentId: input.mpPaymentId,
          mpUserId: input.mpUserId,
          message: account
            ? `A notification arrived for payment ${input.mpPaymentId} of account ${input.mpUserId}, which has no tokens left, so it could not be checked.`
            : `A notification arrived for payment ${input.mpPaymentId} of seller ${input.mpUserId ?? '(unknown)'}, which is not a known account, so it could not be checked.`,
        }),
      );
      return {
        ignored: { outcome: 'ignored', reason: account ? 'not_connected' : 'unknown_seller' },
      };
    }
    return { accounts: [account] };
  }

  /** The store (non-default channel) an order belongs to, wherever it was placed. */
  private async findOrderChannel(orderCode: string): Promise<ID | undefined> {
    if (!orderCode) return undefined;
    const order = await this.connection.rawConnection
      .getRepository(Order)
      .findOne({ where: { code: orderCode }, relations: { channels: true } });
    return order?.channels.find((channel) => channel.code !== DEFAULT_CHANNEL_CODE)?.id;
  }

  private async settle(
    ctx: RequestContext,
    order: Order,
    found: FoundPayment,
    link: MercadoPagoChannelLink,
  ): Promise<ProcessResult> {
    const { payment, account } = found;
    const mpPaymentId = String(payment.id);
    const orderCode = order.code;
    const base = { orderCode, orderState: order.state };

    // Duplicate notification for a payment that already settled the order: nothing to do.
    if (order.payments?.some((p) => p.transactionId === mpPaymentId)) {
      return { outcome: 'already_settled', ...base };
    }

    // The collector must be the account the payment was read with (PRD 9.7). This also stops an
    // approved payment of another account, with a forged `external_reference`, from settling the
    // order.
    if (!found.collector.ok) {
      await this.reviews.markNeedsReview(
        ctx,
        order,
        mpPaymentId,
        found.collector.reason,
        account.mpUserId,
        payment.collector_id,
      );
      return { outcome: 'needs_review', ...base, reason: found.collector.reason };
    }

    const validation = validatePaymentAgainstOrder(payment, {
      code: order.code,
      totalWithTax: order.totalWithTax,
      currencyCode: order.currencyCode,
    });
    if (!validation.ok) {
      // Money was taken for a different amount (for example the cart changed during payment).
      await this.reviews.markNeedsReview(
        ctx,
        order,
        mpPaymentId,
        'amount_mismatch',
        validation.reason,
      );
      return { outcome: 'needs_review', ...base, reason: validation.reason };
    }
    if (!PAYABLE_STATES.has(order.state)) {
      await this.reviews.markNeedsReview(ctx, order, mpPaymentId, 'order_not_payable', order.state);
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
      const result = await runAsSettlement(order.id, () =>
        this.connection.withTransaction(ctx, async (txCtx) => {
          // Payments of the same order are applied one at a time, so two different approved
          // payments racing for one order cannot both be added.
          await this.lockOrder(txCtx, order.id);
          return this.orderService.addPaymentToOrder(txCtx, order.id, {
            method: methodCode,
            metadata: { mpPaymentId },
          });
        }),
      );
      if ('errorCode' in result) {
        await this.setClaimStatus(mpPaymentId, 'recorded');
        if (result.errorCode === 'ORDER_PAYMENT_STATE_ERROR') {
          // Another payment settled the order first: money must go back, a person decides.
          await this.reviews.markNeedsReview(
            ctx,
            order,
            mpPaymentId,
            'order_not_payable',
            'already paid',
          );
          return { outcome: 'needs_review', ...base, reason: 'order_not_payable' };
        }
        throw new Error(
          `Could not add Mercado Pago payment ${mpPaymentId} to order ${orderCode}: ${result.errorCode} ${result.message}`,
        );
      }
      await this.setClaimStatus(mpPaymentId, 'settled');
      if (link.status === 'released') {
        // The payment is verified, so it is honoured; but a released link should have no payments
        // left to arrive, so the rule that releases links needs a look.
        this.eventBus.publish(
          new MercadoPagoAttentionEvent('released_link_payment', ctx.channelId, {
            orderCode,
            mpPaymentId,
            mpUserId: account.mpUserId,
            message: `Approved payment ${mpPaymentId} arrived for the released link between store ${ctx.channel.code} and account ${account.mpUserId}.`,
          }),
        );
      }
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
