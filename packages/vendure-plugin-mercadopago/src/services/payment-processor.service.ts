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
import { MercadoPagoPreference } from '../entities/mercadopago-preference.entity';
import { ClaimStatus, MercadoPagoPaymentClaim } from '../entities/mercadopago-payment-claim.entity';
import { MercadoPagoAttentionEvent } from '../events';
import { checkCollector } from '../lib/collector';
import { isUniqueViolation } from '../lib/db';
import { runAsSettlement } from '../settlement-scope';
import { validatePaymentAgainstOrder } from '../lib/payment-validation';
import { mapPaymentStatus, PaymentOutcome } from '../lib/status';
import {
  MercadoPagoAccountRevokedError,
  MercadoPagoConnectionService,
  MercadoPagoNotConnectedError,
} from './connection.service';
import { MercadoPagoPayment } from './mercadopago-api.service';
import { MercadoPagoPaymentOperations } from './payment-operations.service';
import { MercadoPagoPreferenceRegistry } from './preference-registry.service';
import { MercadoPagoReviewService } from './review.service';

export type IgnoredReason =
  | 'unknown_seller'
  | 'seller_mismatch'
  | 'payment_not_found'
  | 'order_not_found'
  | 'order_mismatch'
  | 'not_connected'
  | 'unknown_preference';

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
   * `user_id` of the notification. On the application route it names the account whose token reads
   * the payment (PRD 9.7).
   */
  mpUserId?: string;
  /** The store whose per-preference route the notification came by (mode `preference`). */
  channelId?: ID;
  /**
   * The registry identifier the per-preference `notification_url` carries. It names the preference,
   * and with it the account that reads the payment: no account is guessed.
   */
  preferenceRef?: string;
  /**
   * The whole `external_reference` the caller holds (the sync mutation). Looked up as a whole in the
   * registry, never parsed.
   */
  externalReference?: string;
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
    private readonly registry: MercadoPagoPreferenceRegistry,
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

    // 1. Which account reads the payment? When the caller holds the preference, the registry says;
    //    otherwise it is the account the notification names. No account is guessed.
    const origin = await this.resolveOrigin(input);
    if ('ignored' in origin) return origin.ignored;
    const { expected } = origin;

    // 2. Ask Mercado Pago, with that account's token. This is the source of truth.
    let read: { payment: MercadoPagoPayment; account: MercadoPagoAccount } | null;
    try {
      read = await this.operations.readPayment(origin.account, input.mpPaymentId);
    } catch (error) {
      if (error instanceof MercadoPagoNotConnectedError) {
        Logger.warn(`Payment ${input.mpPaymentId}: ${error.message}`, loggerCtx);
        // The access was just found revoked: an approved payment may be waiting unsettled.
        if (error instanceof MercadoPagoAccountRevokedError) {
          await this.alertRevoked(input, origin.account, origin.expected);
        }
        return { outcome: 'ignored', reason: 'not_connected' };
      }
      throw error;
    }
    if (!read) return { outcome: 'ignored', reason: 'payment_not_found' };
    const { payment, account } = read;

    // 3. Which preference, order and store? The whole reference is looked up in the registry.
    const reference = payment.external_reference ?? '';
    if (expected && reference !== expected.externalReference) {
      Logger.warn(
        `Payment ${input.mpPaymentId} ignored: it carries another reference than the preference it was notified for.`,
        loggerCtx,
      );
      return { outcome: 'ignored', reason: 'order_mismatch' };
    }
    const entry =
      expected ?? (reference ? await this.registry.findByExternalReference(reference) : null);

    let orderChannelId: ID | undefined;
    let orderCode: string | undefined;
    if (entry) {
      orderChannelId = entry.channelId;
      orderCode = entry.orderCode;
    } else {
      // No preference was issued for this reference. Only a reference that is exactly an order code
      // (the old format) can be matched to an order, so that it is reviewed instead of lost.
      orderChannelId = await this.findOrderChannel(reference);
      orderCode = reference;
    }
    if (orderChannelId === undefined || !orderCode) {
      Logger.warn(
        `Payment ${input.mpPaymentId}: reference "${reference.slice(0, 80)}" is no preference and no order of any store.`,
        loggerCtx,
      );
      return { outcome: 'ignored', reason: 'order_not_found' };
    }
    if (input.channelId !== undefined && String(orderChannelId) !== String(input.channelId)) {
      Logger.warn(
        `Payment ${input.mpPaymentId}: order "${orderCode}" belongs to another store than the one it was notified for.`,
        loggerCtx,
      );
      return { outcome: 'ignored', reason: 'order_mismatch' };
    }

    // 4. A store that never used the account does not settle anything through it. When a
    //    preference was issued the question is settled below, with its collector.
    const link = await this.connections.findLink(orderChannelId, account.id);
    if (!link && !entry) {
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

    const outcome = mapPaymentStatus(payment.status);
    if (outcome !== 'settle') {
      // Only settling needs the payment to prove where it comes from (settle() below). A pending,
      // rejected or reversed payment is recorded as always, so a chargeback alert is never lost.
      // A collector that is not the account is logged: it is the evidence V19 relies on.
      const collector = checkCollector(payment, account.mpUserId);
      if (!collector.ok) {
        Logger.warn(
          `Payment ${input.mpPaymentId} (${payment.status ?? 'unknown'}): ${collector.reason} (read with account ${account.mpUserId}, collector_id ${payment.collector_id ?? 'absent'}).`,
          loggerCtx,
        );
      }
      await this.record(ctx, order, payment, outcome);
      return { outcome, orderCode: order.code, orderState: order.state };
    }
    try {
      return await this.settle(ctx, order, payment, account, entry, link);
    } catch (error) {
      // Reading the merchant order found the access revoked: the payment cannot be checked.
      if (!(error instanceof MercadoPagoAccountRevokedError)) throw error;
      await this.alertRevoked(input, account, entry ?? undefined);
      return { outcome: 'ignored', reason: 'not_connected' };
    }
  }

  /**
   * Cancels a payment that is still `pending` or `in_process` on Mercado Pago (PRD 9.9), for a
   * payment that belongs to an order of the administrator's own channel. The accounts tried are
   * those the store sells with or used to sell with.
   */
  async cancelPending(ctx: RequestContext, mpPaymentId: string): Promise<void> {
    if (!PAYMENT_ID_PATTERN.test(mpPaymentId)) throw new UserInputError('Invalid payment id.');
    const accounts = await this.connections.accountsForChannel(ctx.channelId);
    let found: Awaited<ReturnType<MercadoPagoPaymentOperations['findPayment']>>;
    try {
      found = await this.operations.findPayment(accounts, mpPaymentId);
    } catch (error) {
      if (error instanceof MercadoPagoAccountRevokedError) throw new UserInputError(error.message);
      throw error;
    }
    if (!found) throw new UserInputError('Payment not found.');
    if (!found.collector.ok) {
      throw new UserInputError('The payment was not collected by an account of this store.');
    }
    const { payment, account } = found;
    const issued = payment.external_reference
      ? await this.registry.findByExternalReference(payment.external_reference)
      : null;
    const order =
      issued && String(issued.channelId) === String(ctx.channelId)
        ? await this.orderService.findOneByCode(ctx, issued.orderCode)
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
   * The account whose token reads the payment, and the preference the caller already knows, if any.
   * - The sync mutation holds the whole `external_reference`, and the per-preference route holds the
   *   registry identifier: the registry names the preference and its account, so no account is tried
   *   one by one.
   * - The application route holds only the `user_id` of the notification.
   * An account without tokens cannot read anything: the payment cannot be checked, and the platform
   * is told instead of discarding it silently.
   */
  private async resolveOrigin(
    input: ProcessInput,
  ): Promise<
    { account: MercadoPagoAccount; expected?: MercadoPagoPreference } | { ignored: ProcessResult }
  > {
    if (input.externalReference !== undefined || input.preferenceRef !== undefined) {
      const expected =
        input.externalReference !== undefined
          ? await this.registry.findByExternalReference(input.externalReference)
          : await this.registry.findByToken(input.preferenceRef!);
      if (!expected) {
        Logger.warn(
          `Notification for payment ${input.mpPaymentId} ignored: no preference was issued for it.`,
          loggerCtx,
        );
        return { ignored: { outcome: 'ignored', reason: 'unknown_preference' } };
      }
      if (input.channelId !== undefined && String(expected.channelId) !== String(input.channelId)) {
        Logger.warn(
          `Notification for payment ${input.mpPaymentId} ignored: its preference belongs to another store than the route.`,
          loggerCtx,
        );
        return { ignored: { outcome: 'ignored', reason: 'order_mismatch' } };
      }
      const readerUserId = expected.account.mpUserId;
      if (!this.connections.hasTokens(expected.account)) {
        this.alertUnverifiable(input, readerUserId, true);
        return { ignored: { outcome: 'ignored', reason: 'not_connected' } };
      }
      return { account: expected.account, expected };
    }

    const account = input.mpUserId
      ? await this.connections.findAccountByMpUserId(input.mpUserId)
      : null;
    if (!this.connections.hasTokens(account)) {
      this.alertUnverifiable(input, input.mpUserId, !!account);
      return {
        ignored: { outcome: 'ignored', reason: account ? 'not_connected' : 'unknown_seller' },
      };
    }
    return { account };
  }

  /**
   * The access of the account was just found revoked while reading a payment: an approved payment
   * may be waiting unsettled. The store of the preference is told, or every store that uses the
   * account when only its `user_id` is known, and so is the platform.
   */
  private async alertRevoked(
    input: ProcessInput,
    account: MercadoPagoAccount,
    expected?: MercadoPagoPreference,
  ): Promise<void> {
    const channelIds = expected
      ? [expected.channelId]
      : await this.connections.channelIdsOfAccount(account.id);
    this.alertUnverifiable(input, account.mpUserId, true, channelIds);
  }

  private alertUnverifiable(
    input: ProcessInput,
    mpUserId: string | undefined,
    known: boolean,
    channelIds: ID[] = [],
  ): void {
    Logger.warn(
      `Notification for payment ${input.mpPaymentId} ignored: ${known ? 'the account has no tokens left' : 'no account matches the seller'}.`,
      loggerCtx,
    );
    const details = {
      mpPaymentId: input.mpPaymentId,
      mpUserId,
      message: known
        ? `A notification arrived for payment ${input.mpPaymentId} of account ${mpUserId}, which has no tokens left, so it could not be checked.`
        : `A notification arrived for payment ${input.mpPaymentId} of seller ${mpUserId ?? '(unknown)'}, which is not a known account, so it could not be checked.`,
    };
    // Without a store to tell, the event is for the platform alone.
    for (const channelId of channelIds.length > 0 ? channelIds : [null]) {
      this.eventBus.publish(
        new MercadoPagoAttentionEvent('unverifiable_payment', channelId, details),
      );
    }
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
    payment: MercadoPagoPayment,
    account: MercadoPagoAccount,
    entry: MercadoPagoPreference | null,
    link: MercadoPagoChannelLink | null,
  ): Promise<ProcessResult> {
    const mpPaymentId = String(payment.id);
    const orderCode = order.code;
    const base = { orderCode, orderState: order.state };

    // Duplicate notification for a payment that already settled the order: nothing to do.
    if (order.payments?.some((p) => p.transactionId === mpPaymentId)) {
      return { outcome: 'already_settled', ...base };
    }

    // A payment settles an order only if it belongs to a preference the platform issued for it
    // (PRD 9.7): the reference is registered for this order, the preference's account collected the
    // payment (DEC-44), and Mercado Pago says the payment came from that very preference. This is
    // what stops a payment that merely repeats an order's reference from settling it.
    const issuance = await this.operations.checkIssuance({ payment, account, entry, orderCode });
    if (!issuance.ok) {
      await this.reviews.markNeedsReview(
        ctx,
        order,
        mpPaymentId,
        issuance.reason,
        issuance.detail,
        issuance.observed,
      );
      return { outcome: 'needs_review', ...base, reason: issuance.reason };
    }

    const validation = validatePaymentAgainstOrder(payment, {
      externalReference: entry!.externalReference,
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
      const result = await runAsSettlement(
        {
          orderId: order.id,
          mpPaymentId,
          payment,
          account,
          externalReference: entry!.externalReference,
        },
        () =>
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
      if (link?.status === 'released') {
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
