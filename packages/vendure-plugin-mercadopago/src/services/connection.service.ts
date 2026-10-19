import { Inject, Injectable } from '@nestjs/common';
import { EventBus, ID, Logger, TransactionalConnection } from '@vendure/core';
import { In, LessThan } from 'typeorm';
import { DEFAULT_TOKEN_TTL_SECONDS, loggerCtx, MP_PLUGIN_OPTIONS } from '../constants';
import { MercadoPagoAccount } from '../entities/mercadopago-account.entity';
import { LinkStatus, MercadoPagoChannelLink } from '../entities/mercadopago-channel-link.entity';
import { AttentionReason, MercadoPagoAttentionEvent } from '../events';
import { isUniqueViolation } from '../lib/db';
import { accountAccessContext, accountRefreshContext } from '../lib/token-context';
import type { ResolvedMercadoPagoOptions } from '../types';
import {
  MercadoPagoApiError,
  MercadoPagoApiService,
  OAuthTokenResponse,
} from './mercadopago-api.service';
import { MercadoPagoCipherService } from './cipher.service';

export class MercadoPagoNotConnectedError extends Error {
  constructor(message = 'This store has not connected its Mercado Pago account.') {
    super(message);
    this.name = 'MercadoPagoNotConnectedError';
  }
}

/** The Mercado Pago account is already the active account of another store (PRD 9.2 rule). */
export class AccountAlreadyLinkedError extends Error {
  constructor() {
    super('This Mercado Pago account is already linked to another store.');
    this.name = 'AccountAlreadyLinkedError';
  }
}

export type LinkWithAccount = MercadoPagoChannelLink & { account: MercadoPagoAccount };

const EXPIRY_SAFETY_MARGIN_MS = 60_000;
const MAX_ERROR_LENGTH = 200;

/** Links a store can still be paid through or refunded with, most useful first. */
const LIVE_LINKS: LinkStatus[] = ['active', 'retired'];
const LINK_ORDER: Record<LinkStatus, number> = { active: 0, retired: 1, released: 2 };

/** The partial unique index "one active link per store" fired (PostgreSQL or SQLite wording). */
function isStoreRace(error: unknown): boolean {
  const e = error as { message?: string; driverError?: { constraint?: string; message?: string } };
  const text = `${e?.message ?? ''} ${e?.driverError?.constraint ?? ''} ${e?.driverError?.message ?? ''}`;
  return /one_active_per_channel|mercado_pago_channel_link\.channelId/.test(text);
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

/**
 * Stores and renews Mercado Pago credentials, and tracks which store uses which account (PRD 9.2,
 * 9.3, 9.4). The tokens belong to the account; a store only holds a link to it. Works without a
 * RequestContext on purpose: webhooks and scheduled tasks find accounts by Mercado Pago user id.
 */
@Injectable()
export class MercadoPagoConnectionService {
  private readonly refreshLocks = new Map<string, Promise<MercadoPagoAccount>>();

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly cipher: MercadoPagoCipherService,
    private readonly api: MercadoPagoApiService,
    private readonly eventBus: EventBus,
    @Inject(MP_PLUGIN_OPTIONS) private readonly options: ResolvedMercadoPagoOptions,
  ) {}

  private get accounts() {
    return this.connection.rawConnection.getRepository(MercadoPagoAccount);
  }

  private get links() {
    return this.connection.rawConnection.getRepository(MercadoPagoChannelLink);
  }

  findAccountByMpUserId(mpUserId: string): Promise<MercadoPagoAccount | null> {
    return this.accounts.findOneBy({ mpUserId });
  }

  findAccountById(id: ID): Promise<MercadoPagoAccount | null> {
    return this.accounts.findOneBy({ id });
  }

  /** The link a store sells with today, with its account. */
  async findActiveLink(channelId: ID): Promise<LinkWithAccount | null> {
    return (await this.links.findOne({
      where: { channelId, status: 'active' },
      relations: { account: true },
    })) as LinkWithAccount | null;
  }

  async findActiveAccount(channelId: ID): Promise<MercadoPagoAccount | null> {
    return (await this.findActiveLink(channelId))?.account ?? null;
  }

  /** Every link of the store, newest first. */
  async listLinks(channelId: ID): Promise<LinkWithAccount[]> {
    const rows = (await this.links.find({
      where: { channelId },
      relations: { account: true },
    })) as LinkWithAccount[];
    return rows.sort((a, b) => b.linkedAt.getTime() - a.linkedAt.getTime());
  }

  /**
   * The accounts a store has (or had) a link with, in the given states, the one it sells with
   * first. These are the only accounts whose tokens may be used for the store's payments.
   */
  async accountsForChannel(
    channelId: ID,
    statuses: LinkStatus[] = LIVE_LINKS,
  ): Promise<MercadoPagoAccount[]> {
    const rows = (await this.links.find({
      where: { channelId, status: In(statuses) },
      relations: { account: true },
    })) as LinkWithAccount[];
    return rows
      .sort(
        (a, b) =>
          LINK_ORDER[a.status] - LINK_ORDER[b.status] ||
          b.linkedAt.getTime() - a.linkedAt.getTime(),
      )
      .map((row) => row.account);
  }

  /** The link between a store and an account, in whatever state it is. */
  findLink(channelId: ID, accountId: ID): Promise<MercadoPagoChannelLink | null> {
    return this.links.findOneBy({ channelId, accountId });
  }

  /** Whether the account still holds tokens that can be used (not revoked, not released). */
  hasTokens(account: MercadoPagoAccount | null | undefined): account is MercadoPagoAccount {
    return (
      !!account &&
      (account.status === 'connected' || account.status === 'expiring') &&
      account.accessToken !== ''
    );
  }

  /** True while the account can take payments: not revoked and the access token has not expired. */
  isUsable(account: MercadoPagoAccount | null | undefined, now = Date.now()): boolean {
    return this.hasTokens(account) && account.expiresAt.getTime() - EXPIRY_SAFETY_MARGIN_MS > now;
  }

  /** A store can take payments only with an `active` link to a usable account. */
  async isChannelUsable(channelId: ID): Promise<boolean> {
    return this.isUsable(await this.findActiveAccount(channelId));
  }

  /**
   * Links (or re-links) an account to a store after a successful OAuth exchange (PRD 9.2). The
   * new tokens always replace the account's. Rejects, without touching anything, an account that
   * another store sells with:
   * - the store already sells with this account: the tokens are refreshed;
   * - the store sells with another account: that link is retired and this one becomes active;
   * - the store had this account before: that link is reactivated, no new one is created.
   */
  async link(
    channelId: ID,
    tokens: OAuthTokenResponse,
    attempt = 1,
  ): Promise<{ account: MercadoPagoAccount; link: MercadoPagoChannelLink }> {
    if (tokens.user_id === undefined || tokens.user_id === null || tokens.user_id === '') {
      throw new MercadoPagoApiError(
        'OAuth response did not include the seller user id.',
        'unknown',
      );
    }
    const mpUserId = String(tokens.user_id);

    try {
      return await this.connection.rawConnection.transaction(async (manager) => {
        const accounts = manager.getRepository(MercadoPagoAccount);
        const links = manager.getRepository(MercadoPagoChannelLink);
        const now = new Date();

        let account = await accounts.findOneBy({ mpUserId });
        if (account) {
          const holder = await links.findOneBy({ accountId: account.id, status: 'active' });
          if (holder && String(holder.channelId) !== String(channelId)) {
            throw new AccountAlreadyLinkedError();
          }
        }
        account ??= accounts.create({ mpUserId, publicKey: null });
        this.applyTokens(account, tokens);
        account.publicKey = tokens.public_key ?? null;
        account = await accounts.save(account);

        const current = await links.findOneBy({ channelId, status: 'active' });
        if (current && String(current.accountId) === String(account.id)) {
          return { account, link: current };
        }
        // The old link has to leave `active` first: the partial unique index allows one per store.
        if (current) {
          current.status = 'retired';
          current.retiredAt = now;
          await links.save(current);
        }
        const link =
          (await links.findOneBy({ channelId, accountId: account.id })) ??
          links.create({ channelId, accountId: account.id });
        link.status = 'active';
        link.linkedAt = now;
        link.retiredAt = null;
        link.releasedAt = null;
        return { account, link: await links.save(link) };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Two requests of the same store linking at once: the loser finds the other's link and
      // retires or reuses it. Any other unique violation means the account belongs to another store.
      if (attempt === 1 && isStoreRace(error)) return this.link(channelId, tokens, attempt + 1);
      throw new AccountAlreadyLinkedError();
    }
  }

  /**
   * "Unlink" (PRD 9.2): the store stops selling with its account, but nothing is deleted. Its past
   * sales can still be refunded and its pending payments are still processed.
   */
  async retire(channelId: ID): Promise<boolean> {
    const result = await this.links.update(
      { channelId, status: 'active' },
      { status: 'retired', retiredAt: new Date() },
    );
    return (result.affected ?? 0) > 0;
  }

  /** Returns a usable access token for the account the store sells with. */
  async getAccessToken(
    channelId: ID,
  ): Promise<{ account: MercadoPagoAccount; accessToken: string }> {
    const link = await this.findActiveLink(channelId);
    if (!link) throw new MercadoPagoNotConnectedError();
    return this.getAccountToken(link.account);
  }

  /** Returns a usable access token for an account, renewing it on the spot if it is about to expire. */
  async getAccountToken(
    account: MercadoPagoAccount,
  ): Promise<{ account: MercadoPagoAccount; accessToken: string }> {
    if (!this.hasTokens(account)) throw new MercadoPagoNotConnectedError();
    let current = account;
    if (current.expiresAt.getTime() - EXPIRY_SAFETY_MARGIN_MS <= Date.now()) {
      try {
        current = await this.refresh(account.id);
      } catch {
        throw new MercadoPagoNotConnectedError(
          'The Mercado Pago access token expired and could not be renewed. The store must link its account again.',
        );
      }
    }
    return {
      account: current,
      accessToken: this.cipher.decrypt(current.accessToken, accountAccessContext(current.mpUserId)),
    };
  }

  /**
   * Renews one account. Concurrent calls for the same account share a single request: two stores
   * can share an account (one retired, one active), and the refresh token rotates, so it must
   * never be spent twice.
   */
  refresh(accountId: ID): Promise<MercadoPagoAccount> {
    const key = String(accountId);
    const running = this.refreshLocks.get(key);
    if (running) return running;
    const promise = this.doRefresh(accountId).finally(() => this.refreshLocks.delete(key));
    this.refreshLocks.set(key, promise);
    return promise;
  }

  /**
   * Daily task (PRD 9.4): renews every account that some store still uses or can refund with
   * (an `active` or `retired` link) and expires within the configured window. A failure marks the
   * account `expiring` and notifies those stores and the superadmin.
   */
  async refreshExpiring(now = new Date()): Promise<{ refreshed: number; failed: number }> {
    const limit = new Date(now.getTime() + this.options.refreshWindowDays * 86_400_000);
    const live = await this.links.find({ where: { status: In(LIVE_LINKS) } });
    const accountIds = new Map(live.map((link) => [String(link.accountId), link.accountId]));
    if (accountIds.size === 0) return { refreshed: 0, failed: 0 };
    const due = await this.accounts.find({
      where: {
        id: In([...accountIds.values()]),
        status: In(['connected', 'expiring']),
        expiresAt: LessThan(limit),
      },
    });
    let refreshed = 0;
    let failed = 0;
    for (const account of due) {
      try {
        await this.refresh(account.id);
        refreshed++;
      } catch (error) {
        failed++;
        Logger.warn(
          `Could not renew Mercado Pago token for account ${account.mpUserId}: ${describeError(error)}`,
          loggerCtx,
        );
      }
    }
    return { refreshed, failed };
  }

  /**
   * Reacts to an `mp-connect` notification without trusting its payload (PRD 9.4, 11): checks with
   * Mercado Pago whether the account's token still works, and marks the account disconnected only
   * if the access was really revoked.
   */
  async reconcileAfterConnectNotification(
    mpUserId: string,
  ): Promise<'unknown_account' | 'still_connected' | 'disconnected'> {
    const account = await this.findAccountByMpUserId(mpUserId);
    if (!this.hasTokens(account)) return 'unknown_account';
    try {
      const accessToken = this.cipher.decrypt(
        account.accessToken,
        accountAccessContext(account.mpUserId),
      );
      await this.api.checkToken(accessToken);
      return 'still_connected';
    } catch (error) {
      if (!(error instanceof MercadoPagoApiError) || error.kind !== 'auth') throw error;
    }
    try {
      await this.refresh(account.id);
      return 'still_connected';
    } catch (error) {
      if (error instanceof MercadoPagoApiError && error.kind === 'unavailable') throw error;
      await this.markDisconnected(account.id, 'Access was revoked from Mercado Pago.');
      return 'disconnected';
    }
  }

  /**
   * The seller revoked access: the account, and so every link it has, stops working. The tokens
   * are useless after a revocation, so they are not kept.
   */
  async markDisconnected(accountId: ID, reason: string): Promise<void> {
    const account = await this.findAccountById(accountId);
    if (!account) return;
    account.status = 'disconnected';
    account.lastError = reason.slice(0, MAX_ERROR_LENGTH);
    account.accessToken = '';
    account.refreshToken = '';
    await this.accounts.save(account);
    await this.notifyChannels(account, 'account_disconnected', reason);
  }

  private async doRefresh(accountId: ID): Promise<MercadoPagoAccount> {
    const current = await this.findAccountById(accountId);
    if (!this.hasTokens(current)) throw new MercadoPagoNotConnectedError();
    try {
      const refreshToken = this.cipher.decrypt(
        current.refreshToken,
        accountRefreshContext(current.mpUserId),
      );
      const tokens = await this.api.refreshAccessToken(refreshToken);
      // The refresh token rotates: the new one must be stored (PRD 9.4).
      this.applyTokens(current, tokens);
      return await this.accounts.save(current);
    } catch (error) {
      current.status = 'expiring';
      current.lastError = describeError(error);
      await this.accounts.save(current);
      await this.notifyChannels(current, 'token_renewal_failed', current.lastError);
      throw error;
    }
  }

  /** Tells every store that still uses the account (or can refund with it). */
  private async notifyChannels(
    account: MercadoPagoAccount,
    reason: AttentionReason,
    message: string,
  ): Promise<void> {
    const rows = await this.links.find({
      where: { accountId: account.id, status: In(LIVE_LINKS) },
    });
    const channelIds = new Map(rows.map((row) => [String(row.channelId), row.channelId]));
    for (const channelId of channelIds.values()) {
      this.eventBus.publish(
        new MercadoPagoAttentionEvent(reason, channelId, { message, mpUserId: account.mpUserId }),
      );
    }
  }

  private applyTokens(account: MercadoPagoAccount, tokens: OAuthTokenResponse): void {
    const ttlSeconds = tokens.expires_in ?? DEFAULT_TOKEN_TTL_SECONDS;
    account.accessToken = this.cipher.encrypt(
      tokens.access_token,
      accountAccessContext(account.mpUserId),
    );
    account.refreshToken = this.cipher.encrypt(
      tokens.refresh_token,
      accountRefreshContext(account.mpUserId),
    );
    account.expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    if (tokens.scope !== undefined) account.scope = tokens.scope;
    account.status = 'connected';
    account.lastError = null;
  }
}
