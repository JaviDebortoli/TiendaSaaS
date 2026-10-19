import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { MercadoPagoAccount } from '../entities/mercadopago-account.entity';
import { MercadoPagoPreference } from '../entities/mercadopago-preference.entity';
import { toMercadoPagoAmount } from '../lib/amounts';
import { CollectorCheck, checkCollector } from '../lib/collector';
import {
  MercadoPagoAccountRevokedError,
  MercadoPagoConnectionService,
  MercadoPagoNotConnectedError,
} from './connection.service';
import {
  MercadoPagoApiError,
  MercadoPagoApiService,
  MercadoPagoPayment,
} from './mercadopago-api.service';
import { MercadoPagoPreferenceRegistry } from './preference-registry.service';
import { MercadoPagoReviewService, ReviewReason } from './review.service';

/** A payment read with the token of `account`, and whether Mercado Pago names that account as collector. */
export interface FoundPayment {
  payment: MercadoPagoPayment;
  account: MercadoPagoAccount;
  collector: CollectorCheck;
}

/** Why a payment may not settle an order, and the evidence the review note keeps. */
export type IssuanceCheck =
  { ok: true } | { ok: false; reason: ReviewReason; detail: string; observed?: string | number };

type AccountResult = { ok: true; account: MercadoPagoAccount } | { ok: false; message: string };

/** What a store owner reads when the account a payment was collected with can no longer act on it. */
export function accountNotLinkedMessage(mpUserId: string): string {
  return `Este pago se cobró en la cuenta ${mpUserId}, que ya no está vinculada. Hacé el reembolso desde el panel de Mercado Pago de esa cuenta.`;
}

/**
 * Calls the payment handler makes against Mercado Pago. Each payment is read, refunded or
 * cancelled with the token of the account that collected it, which is not always the account the
 * store sells with today.
 */
@Injectable()
export class MercadoPagoPaymentOperations {
  constructor(
    private readonly connections: MercadoPagoConnectionService,
    private readonly api: MercadoPagoApiService,
    private readonly reviews: MercadoPagoReviewService,
    private readonly registry: MercadoPagoPreferenceRegistry,
  ) {}

  /**
   * Reads one payment with the token of one account. Null when that account does not see it. The
   * account returned is the one whose token was used: if it had to be renewed first, the renewed
   * row, so the next call does not renew it again. A 401 is a suspected revocation
   * (`withAccountToken`): `MercadoPagoAccountRevokedError` when it is confirmed.
   */
  async readPayment(
    account: MercadoPagoAccount,
    mpPaymentId: string,
  ): Promise<{ payment: MercadoPagoPayment; account: MercadoPagoAccount } | null> {
    try {
      const { value, account: used } = await this.connections.withAccountToken(account, (token) =>
        this.api.getPayment(token, mpPaymentId),
      );
      return { payment: value, account: used };
    } catch (error) {
      if (error instanceof MercadoPagoApiError && error.kind === 'not_found') return null;
      throw error;
    }
  }

  /**
   * The preference a payment came from, asked to Mercado Pago through the payment's own order
   * (PRD 9.7). It is never taken from the redirect. Undefined when it cannot be found out: the
   * payment has no order, the order is unknown, or it carries no preference. A temporary failure
   * of Mercado Pago is not "unknown": it is thrown, so the notification is retried.
   */
  async preferenceOfPayment(
    account: MercadoPagoAccount,
    payment: MercadoPagoPayment,
  ): Promise<string | undefined> {
    const orderId = payment.order?.id;
    if (orderId === undefined || orderId === null) return undefined;
    try {
      const { value: merchantOrder } = await this.connections.withAccountToken(account, (token) =>
        this.api.getMerchantOrder(token, String(orderId)),
      );
      return merchantOrder.preference_id || undefined;
    } catch (error) {
      if (
        error instanceof MercadoPagoApiError &&
        (error.kind === 'not_found' || error.kind === 'auth' || error.kind === 'rejected')
      ) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * The three conditions for a payment to settle an order (PRD 9.7), in this order:
   * 1. its `external_reference` is a preference the platform issued, and for this order;
   * 2. the account of that preference is the one that collected the payment, and it is the account
   *    whose token read it (DEC-44);
   * 3. the payment belongs to that same preference, as Mercado Pago says through the payment's
   *    order, not as the redirect says.
   * `account` is the account whose token read the payment.
   */
  async checkIssuance(args: {
    payment: MercadoPagoPayment;
    account: MercadoPagoAccount;
    entry: MercadoPagoPreference | null;
    orderCode: string;
  }): Promise<IssuanceCheck> {
    const { payment, account, entry, orderCode } = args;
    if (!entry) {
      return {
        ok: false,
        reason: 'unknown_preference',
        detail: `no preference was issued for the reference "${String(payment.external_reference ?? '').slice(0, 80)}"`,
      };
    }
    if (entry.orderCode !== orderCode) {
      return {
        ok: false,
        reason: 'unknown_preference',
        detail: `the reference belongs to a preference issued for another order`,
      };
    }
    const collector = checkCollector(payment, account.mpUserId);
    if (!collector.ok) {
      return {
        ok: false,
        reason: collector.reason,
        detail: account.mpUserId,
        observed: payment.collector_id,
      };
    }
    if (String(payment.collector_id) !== entry.account.mpUserId) {
      return {
        ok: false,
        reason: 'collector_mismatch',
        detail: account.mpUserId,
        observed: payment.collector_id,
      };
    }
    const actual = await this.preferenceOfPayment(account, payment);
    if (actual === undefined) {
      return {
        ok: false,
        reason: 'unknown_preference',
        detail: 'the preference of the payment could not be obtained from Mercado Pago',
      };
    }
    if (actual !== entry.preferenceId) {
      return {
        ok: false,
        reason: 'preference_mismatch',
        detail: String(entry.preferenceId),
        observed: actual,
      };
    }
    return { ok: true };
  }

  /**
   * Reads a payment with each candidate account in turn and returns the first one whose token
   * sees it and that Mercado Pago names as the collector. If none does, the first payment seen is
   * returned with its collector problem, so the caller can refuse it and say why. Returns null
   * when no candidate sees the payment.
   */
  async findPayment(
    candidates: MercadoPagoAccount[],
    mpPaymentId: string,
  ): Promise<FoundPayment | null> {
    let first: FoundPayment | undefined;
    let authError: MercadoPagoApiError | undefined;
    let revoked: MercadoPagoAccountRevokedError | undefined;
    let tried = 0;
    for (const candidate of candidates) {
      if (!this.connections.hasTokens(candidate)) continue;
      let read: { payment: MercadoPagoPayment; account: MercadoPagoAccount };
      try {
        const { value, account } = await this.connections.withAccountToken(candidate, (token) =>
          this.api.getPayment(token, mpPaymentId),
        );
        read = { payment: value, account };
      } catch (error) {
        // An account that cannot act any more is skipped, like one without tokens.
        if (error instanceof MercadoPagoAccountRevokedError) {
          revoked ??= error;
          continue;
        }
        if (error instanceof MercadoPagoNotConnectedError) continue;
        tried++;
        if (error instanceof MercadoPagoApiError && error.kind === 'not_found') continue;
        if (error instanceof MercadoPagoApiError && error.kind === 'auth') {
          authError ??= error;
          continue;
        }
        throw error;
      }
      tried++;
      const { payment, account } = read;
      const found = { payment, account, collector: checkCollector(payment, account.mpUserId) };
      if (found.collector.ok) return found;
      first ??= found;
    }
    if (first) return first;
    if (revoked) throw revoked;
    if (tried === 0) throw new MercadoPagoNotConnectedError();
    if (authError) throw authError;
    return null;
  }

  /** Cancels a payment that is still `pending` or `in_process` (PRD 9.9). */
  async cancel(
    ctx: RequestContext,
    mpPaymentId: string,
    mpAccountUserId: string | undefined,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const resolved = await this.accountForPayment(ctx, mpAccountUserId);
    if (!resolved.ok) return resolved;
    try {
      await this.connections.withAccountToken(resolved.account, (token) =>
        this.api.cancelPayment(token, mpPaymentId),
      );
      return { ok: true };
    } catch (error) {
      if (error instanceof MercadoPagoAccountRevokedError) {
        return { ok: false, message: accountNotLinkedMessage(resolved.account.mpUserId) };
      }
      return {
        ok: false,
        message: this.describe(error, 'Mercado Pago could not cancel the payment'),
      };
    }
  }

  /**
   * Full refund when `amountMinorUnits` covers the whole payment (empty body), partial otherwise
   * (PRD 9.9). A refund the seller's balance cannot cover comes back as a readable message.
   */
  async refund(
    ctx: RequestContext,
    mpPaymentId: string,
    mpAccountUserId: string | undefined,
    amountMinorUnits: number,
    paymentAmountMinorUnits: number,
    idempotencyKey: string,
  ): Promise<{ ok: true; refundId: string } | { ok: false; message: string }> {
    const resolved = await this.accountForPayment(ctx, mpAccountUserId);
    if (!resolved.ok) return resolved;
    try {
      const full = amountMinorUnits === paymentAmountMinorUnits;
      const { value } = await this.connections.withAccountToken(resolved.account, (token) =>
        this.api.refundPayment(
          token,
          mpPaymentId,
          full ? undefined : toMercadoPagoAmount(amountMinorUnits),
          idempotencyKey,
        ),
      );
      return { ok: true, refundId: value.id };
    } catch (error) {
      if (error instanceof MercadoPagoAccountRevokedError) {
        return { ok: false, message: accountNotLinkedMessage(resolved.account.mpUserId) };
      }
      return { ok: false, message: this.describe(error, 'Mercado Pago rejected the refund') };
    }
  }

  /**
   * The account that collected a payment, as long as it can still act on it: it holds tokens and
   * the store still has a live link with it. A payment without the stamp (taken before accounts
   * and links existed and not migrated) is assumed to belong to the store's active account.
   */
  async accountForPayment(
    ctx: RequestContext,
    mpAccountUserId: string | undefined,
  ): Promise<AccountResult> {
    if (!mpAccountUserId) {
      const active = await this.connections.findActiveAccount(ctx.channelId);
      return this.connections.hasTokens(active)
        ? { ok: true, account: active }
        : { ok: false, message: new MercadoPagoNotConnectedError().message };
    }
    const account = await this.connections.findAccountByMpUserId(mpAccountUserId);
    const link = account ? await this.connections.findLink(ctx.channelId, account.id) : null;
    if (!this.connections.hasTokens(account) || !link || link.status === 'released') {
      return { ok: false, message: accountNotLinkedMessage(mpAccountUserId) };
    }
    return { ok: true, account };
  }

  private describe(error: unknown, prefix: string): string {
    if (error instanceof MercadoPagoNotConnectedError) return error.message;
    if (error instanceof MercadoPagoApiError) return `${prefix}: ${error.message}`;
    return `${prefix}.`;
  }
}
