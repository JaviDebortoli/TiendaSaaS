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

/**
 * Mercado Pago revoked the access of the account, confirmed with Mercado Pago itself (PRD 9.4).
 * It is a kind of "not connected": callers that already handle that keep working.
 */
export class MercadoPagoAccountRevokedError extends MercadoPagoNotConnectedError {
  constructor() {
    super(
      'Mercado Pago revoked the access of this account. A store has to link an account to charge again.',
    );
    this.name = 'MercadoPagoAccountRevokedError';
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

/**
 * Mercado Pago says the token itself is not valid (HTTP 401). A 403 or a 404 says something else
 * (a payment of another account, for example) and never starts a verification (PRD 9.4).
 */
export function isTokenRejection(error: unknown): error is MercadoPagoApiError {
  return error instanceof MercadoPagoApiError && error.kind === 'auth' && error.status === 401;
}

/** Renewing answered that the refresh token is no longer valid: the only proof of a revocation. */
function isRefreshRejection(error: unknown): boolean {
  return (
    error instanceof MercadoPagoApiError &&
    (error.kind === 'invalid_grant' || error.kind === 'auth')
  );
}

/** What checking an account's access found out (PRD 9.4). */
export type AccessVerdict =
  /** The account has no tokens left: somebody already revoked or released it. */
  | { kind: 'no_tokens' }
  /** Other tokens than the rejected one are stored: the rejection was about a token already replaced. */
  | { kind: 'replaced'; account: MercadoPagoAccount; accessToken: string }
  /** The token was rejected, renewing it worked. */
  | { kind: 'renewed'; account: MercadoPagoAccount; accessToken: string }
  /** Mercado Pago accepts the token. */
  | { kind: 'fine' }
  /** The account was checked a moment ago and was fine: it is not checked again yet. */
  | { kind: 'recent' }
  /** Renewing was refused: the access was revoked, the links are retired. */
  | { kind: 'revoked' };

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
  private readonly verifications = new Map<string, Promise<AccessVerdict>>();
  private readonly accountQueues = new Map<string, Promise<unknown>>();
  /** When each account was last found fine. Per process: it only spares Mercado Pago calls. */
  private readonly verifiedAt = new Map<string, number>();

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
  link(
    channelId: ID,
    tokens: OAuthTokenResponse,
  ): Promise<{ account: MercadoPagoAccount; link: MercadoPagoChannelLink }> {
    return this.linkOnce(channelId, tokens, 1);
  }

  private async linkOnce(
    channelId: ID,
    tokens: OAuthTokenResponse,
    attempt: number,
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
      if (attempt === 1 && isStoreRace(error)) return this.linkOnce(channelId, tokens, attempt + 1);
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
   * Renews one account. Concurrent calls in this process share a single request, and the renewal
   * itself runs under the account lock (see `withAccountLock`): two stores can share an account and
   * the refresh token rotates, so it must never be spent twice.
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
   * Runs `operation` with a usable access token of the account. A response that says the token is
   * not valid (HTTP 401) is a suspected revocation, not a failure of the operation (PRD 9.4):
   * the access is checked once, under the account lock, and then
   * - the token was replaced or could be renewed: the operation is repeated once with the new one;
   * - the access was revoked: `MercadoPagoAccountRevokedError`, the links are already retired;
   * - the check was not conclusive (Mercado Pago down): its error is thrown, nothing changes;
   * - Mercado Pago accepts the token, or it was checked a moment ago: the original error stays.
   * Any other error, a 403 or a 404 included, goes straight to the caller.
   */
  async withAccountToken<T>(
    account: MercadoPagoAccount,
    operation: (accessToken: string) => Promise<T>,
  ): Promise<{ value: T; account: MercadoPagoAccount }> {
    const first = await this.getAccountToken(account);
    try {
      return { value: await operation(first.accessToken), account: first.account };
    } catch (error) {
      if (!isTokenRejection(error)) throw error;
      const verdict = await this.verifyAccess(first.account.id, first.accessToken);
      switch (verdict.kind) {
        case 'replaced':
        case 'renewed':
          // Once. A second rejection is the answer: nothing more is checked for it.
          return { value: await operation(verdict.accessToken), account: verdict.account };
        case 'revoked':
        case 'no_tokens':
          throw new MercadoPagoAccountRevokedError();
        default:
          throw error;
      }
    }
  }

  /**
   * The DEC-16 check: does Mercado Pago still accept this account's access? Asks `GET /users/me`
   * and, if the token is refused, renews it; only a renewal that is refused concludes the access
   * was revoked, and then the account is disconnected and its links retired (DEC-42).
   *
   * It is the single path to that conclusion. It runs under the account lock and always reads the
   * stored tokens again first (PRD 9.4): if they are not the ones that were rejected, somebody
   * renewed them meanwhile and nothing was revoked. `rejectedAccessToken` is the token that got
   * the 401; leave it out to check the account as it is now (an `mp-connect` notification).
   * Calls for the same account and token that are in flight share one check, and an account found
   * fine is not checked again for a rejection during `authCheckPauseMinutes`.
   * A check that cannot tell (Mercado Pago down, network) throws and changes nothing.
   */
  verifyAccess(accountId: ID, rejectedAccessToken?: string): Promise<AccessVerdict> {
    const key = `${accountId}:${rejectedAccessToken ?? ''}`;
    const running = this.verifications.get(key);
    if (running) return running;
    const promise = this.doVerify(accountId, rejectedAccessToken).finally(() =>
      this.verifications.delete(key),
    );
    this.verifications.set(key, promise);
    return promise;
  }

  private doVerify(accountId: ID, rejectedAccessToken?: string): Promise<AccessVerdict> {
    return this.withAccountLock(accountId, async (): Promise<AccessVerdict> => {
      // The stored tokens, read again now that nobody else can change them.
      const current = await this.findAccountById(accountId);
      if (!this.hasTokens(current)) return { kind: 'no_tokens' };
      const accessToken = this.cipher.decrypt(
        current.accessToken,
        accountAccessContext(current.mpUserId),
      );
      if (rejectedAccessToken !== undefined) {
        if (accessToken !== rejectedAccessToken) {
          return { kind: 'replaced', account: current, accessToken };
        }
        if (this.foundFineRecently(current.id)) return { kind: 'recent' };
      }
      try {
        await this.api.checkToken(accessToken);
        this.verifiedAt.set(String(current.id), Date.now());
        return { kind: 'fine' };
      } catch (error) {
        if (!(error instanceof MercadoPagoApiError) || error.kind !== 'auth') throw error;
      }
      let renewed: MercadoPagoAccount;
      try {
        renewed = await this.renewLocked(current, false);
      } catch (error) {
        if (!isRefreshRejection(error)) throw error;
        await this.disconnectLocked(current.id, 'Access was revoked from Mercado Pago.');
        return { kind: 'revoked' };
      }
      this.verifiedAt.set(String(current.id), Date.now());
      return {
        kind: 'renewed',
        account: renewed,
        accessToken: this.cipher.decrypt(
          renewed.accessToken,
          accountAccessContext(renewed.mpUserId),
        ),
      };
    });
  }

  private foundFineRecently(accountId: ID): boolean {
    const at = this.verifiedAt.get(String(accountId));
    return at !== undefined && Date.now() - at < this.options.authCheckPauseMinutes * 60_000;
  }

  /**
   * Serializes what changes the tokens of one account, in this process and between processes: the
   * server and the worker can both renew or check the same account, and a refresh token that the
   * other one already rotated is refused, which must never be read as a revocation. PostgreSQL
   * holds a transaction-scoped advisory lock per account (like the one per order, DEC-14); SQL.js
   * has a single process, so the queue alone is enough.
   */
  private withAccountLock<T>(accountId: ID, fn: () => Promise<T>): Promise<T> {
    const key = String(accountId);
    const run = async () => {
      if (this.connection.rawConnection.options.type !== 'postgres') return fn();
      return this.connection.rawConnection.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`mp-account:${key}`]);
        return fn();
      });
    };
    const next = (this.accountQueues.get(key) ?? Promise.resolve()).then(run, run);
    const tail = next.catch(() => undefined);
    this.accountQueues.set(key, tail);
    void tail.then(() => {
      if (this.accountQueues.get(key) === tail) this.accountQueues.delete(key);
    });
    return next;
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
   * Mercado Pago whether the account's token still works (`verifyAccess`), and marks the account
   * disconnected only if the access was really revoked.
   */
  async reconcileAfterConnectNotification(
    mpUserId: string,
  ): Promise<'unknown_account' | 'still_connected' | 'disconnected'> {
    const account = await this.findAccountByMpUserId(mpUserId);
    if (!this.hasTokens(account)) return 'unknown_account';
    const verdict = await this.verifyAccess(account.id);
    if (verdict.kind === 'revoked') return 'disconnected';
    return verdict.kind === 'no_tokens' ? 'unknown_account' : 'still_connected';
  }

  /**
   * The seller revoked access, confirmed with Mercado Pago itself (never taken from the body of an
   * `mp-connect` notification): the account stops working and its tokens, useless now, are not kept.
   * Takes the account lock and reads the account again, like every change to its tokens.
   */
  markDisconnected(accountId: ID, reason: string): Promise<void> {
    return this.withAccountLock(accountId, () => this.disconnectLocked(accountId, reason));
  }

  /**
   * The account belongs to its holder, not to the store, so a store cannot go on selling with it
   * without a new authorization: every `active` link becomes `retired`. The store keeps what a
   * retired link gives (notifications, pending payments, and refunds once the account has tokens
   * again). Authorizing the account again in the same store reactivates its link; if another store
   * took it meanwhile, that is rejected like any account that is active elsewhere.
   *
   * A failed renewal is not a revocation (see `renewLocked`): there the link stays `active`.
   * Only callable with the account lock held, after its tokens were read again.
   */
  private async disconnectLocked(accountId: ID, reason: string): Promise<void> {
    const account = await this.findAccountById(accountId);
    if (!account) return;
    account.status = 'disconnected';
    account.lastError = reason.slice(0, MAX_ERROR_LENGTH);
    account.accessToken = '';
    account.refreshToken = '';
    await this.connection.rawConnection.transaction(async (manager) => {
      await manager.getRepository(MercadoPagoAccount).save(account);
      await manager
        .getRepository(MercadoPagoChannelLink)
        .update(
          { accountId: account.id, status: 'active' },
          { status: 'retired', retiredAt: new Date() },
        );
    });
    this.verifiedAt.delete(String(account.id));
    await this.notifyChannels(account, 'account_disconnected', reason);
  }

  private doRefresh(accountId: ID): Promise<MercadoPagoAccount> {
    // What this caller saw, before it waited for the lock.
    const seenPromise = this.findAccountById(accountId);
    return this.withAccountLock(accountId, async () => {
      const seen = await seenPromise;
      const current = await this.findAccountById(accountId);
      if (!this.hasTokens(current)) throw new MercadoPagoNotConnectedError();
      // Another process renewed it while this call waited: those tokens are the ones to use.
      if (
        seen &&
        (seen.accessToken !== current.accessToken || seen.refreshToken !== current.refreshToken)
      ) {
        return current;
      }
      return this.renewLocked(current, true);
    });
  }

  /**
   * Spends the refresh token of an account and stores the new pair. Only callable with the account
   * lock held and `current` read under it. A failure marks the account `expiring` and tells its
   * stores when `recordFailure` is set (the daily and on-demand renewals); the access check
   * leaves the account as it is, because it concludes by itself what a failure means.
   */
  private async renewLocked(
    current: MercadoPagoAccount,
    recordFailure: boolean,
  ): Promise<MercadoPagoAccount> {
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
      if (recordFailure) {
        current.status = 'expiring';
        current.lastError = describeError(error);
        await this.accounts.save(current);
        await this.notifyChannels(current, 'token_renewal_failed', current.lastError);
      }
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
