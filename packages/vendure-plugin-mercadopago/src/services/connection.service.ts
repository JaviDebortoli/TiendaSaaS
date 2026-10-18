import { Inject, Injectable } from '@nestjs/common';
import { EventBus, ID, Logger, TransactionalConnection } from '@vendure/core';
import { In, LessThan } from 'typeorm';
import { DEFAULT_TOKEN_TTL_SECONDS, loggerCtx, MP_PLUGIN_OPTIONS } from '../constants';
import { MercadoPagoConnection } from '../entities/mercadopago-connection.entity';
import { MercadoPagoAttentionEvent } from '../events';
import { isUniqueViolation } from '../lib/db';
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

/** The Mercado Pago account is already linked to another store (PRD 9.2 rule). */
export class AccountAlreadyLinkedError extends Error {
  constructor() {
    super('This Mercado Pago account is already linked to another store.');
    this.name = 'AccountAlreadyLinkedError';
  }
}

const EXPIRY_SAFETY_MARGIN_MS = 60_000;
const MAX_ERROR_LENGTH = 200;

const accessContext = (channelId: ID) => `mp-connection:${channelId}:access`;
const refreshContext = (channelId: ID) => `mp-connection:${channelId}:refresh`;

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

/**
 * Stores and renews each store's Mercado Pago credentials (PRD 9.3, 9.4). Works without a
 * RequestContext on purpose: webhooks and scheduled tasks find stores by Mercado Pago user id.
 */
@Injectable()
export class MercadoPagoConnectionService {
  private readonly refreshLocks = new Map<string, Promise<MercadoPagoConnection>>();

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly cipher: MercadoPagoCipherService,
    private readonly api: MercadoPagoApiService,
    private readonly eventBus: EventBus,
    @Inject(MP_PLUGIN_OPTIONS) private readonly options: ResolvedMercadoPagoOptions,
  ) {}

  private get repo() {
    return this.connection.rawConnection.getRepository(MercadoPagoConnection);
  }

  findByChannelId(channelId: ID): Promise<MercadoPagoConnection | null> {
    return this.repo.findOneBy({ channelId });
  }

  findByMpUserId(mpUserId: string): Promise<MercadoPagoConnection | null> {
    return this.repo.findOneBy({ mpUserId });
  }

  /** True while the store can take payments: not revoked and the access token has not expired. */
  isUsable(connection: MercadoPagoConnection | null | undefined, now = Date.now()): boolean {
    return (
      !!connection &&
      connection.status !== 'disconnected' &&
      connection.expiresAt.getTime() - EXPIRY_SAFETY_MARGIN_MS > now
    );
  }

  /**
   * Links (or re-links) an account to a channel after a successful OAuth exchange.
   * Rejects, without touching anything, an account that another store already uses.
   */
  async link(channelId: ID, tokens: OAuthTokenResponse): Promise<MercadoPagoConnection> {
    if (tokens.user_id === undefined || tokens.user_id === null || tokens.user_id === '') {
      throw new MercadoPagoApiError(
        'OAuth response did not include the seller user id.',
        'unknown',
      );
    }
    const mpUserId = String(tokens.user_id);

    const owner = await this.findByMpUserId(mpUserId);
    if (owner && String(owner.channelId) !== String(channelId)) {
      // A revoked account serves no store, so its owner can move it by authorizing again.
      if (owner.status !== 'disconnected') throw new AccountAlreadyLinkedError();
      await this.repo.delete({ id: owner.id });
    }

    const entity =
      (await this.findByChannelId(channelId)) ?? this.repo.create({ channelId, publicKey: null });
    this.applyTokens(entity, channelId, tokens);
    entity.mpUserId = mpUserId;
    entity.publicKey = tokens.public_key ?? null;
    try {
      return await this.repo.save(entity);
    } catch (error) {
      if (isUniqueViolation(error)) throw new AccountAlreadyLinkedError();
      throw error;
    }
  }

  /** Removes the credentials. The store stops taking payments until it links an account again. */
  async disconnect(channelId: ID): Promise<boolean> {
    const result = await this.repo.delete({ channelId });
    return (result.affected ?? 0) > 0;
  }

  /** Returns a usable access token, renewing it on the spot if it is about to expire. */
  async getAccessToken(
    channelId: ID,
  ): Promise<{ connection: MercadoPagoConnection; accessToken: string }> {
    let connection = await this.findByChannelId(channelId);
    if (!connection || connection.status === 'disconnected') {
      throw new MercadoPagoNotConnectedError();
    }
    if (connection.expiresAt.getTime() - EXPIRY_SAFETY_MARGIN_MS <= Date.now()) {
      try {
        connection = await this.refresh(channelId);
      } catch {
        throw new MercadoPagoNotConnectedError(
          'The Mercado Pago access token expired and could not be renewed. The store must link its account again.',
        );
      }
    }
    return {
      connection,
      accessToken: this.cipher.decrypt(connection.accessToken, accessContext(channelId)),
    };
  }

  /** Renews one connection. Concurrent calls for the same channel share a single request. */
  refresh(channelId: ID): Promise<MercadoPagoConnection> {
    const key = String(channelId);
    const running = this.refreshLocks.get(key);
    if (running) return running;
    const promise = this.doRefresh(channelId).finally(() => this.refreshLocks.delete(key));
    this.refreshLocks.set(key, promise);
    return promise;
  }

  /**
   * Daily task (PRD 9.4): renews every connection that expires within the configured window.
   * A failure marks the connection `expiring` and notifies the store and the superadmin.
   */
  async refreshExpiring(now = new Date()): Promise<{ refreshed: number; failed: number }> {
    const limit = new Date(now.getTime() + this.options.refreshWindowDays * 86_400_000);
    const due = await this.repo.find({
      where: { status: In(['connected', 'expiring']), expiresAt: LessThan(limit) },
    });
    let refreshed = 0;
    let failed = 0;
    for (const connection of due) {
      try {
        await this.refresh(connection.channelId);
        refreshed++;
      } catch (error) {
        failed++;
        Logger.warn(
          `Could not renew Mercado Pago token for channel ${connection.channelId}: ${describeError(error)}`,
          loggerCtx,
        );
      }
    }
    return { refreshed, failed };
  }

  /**
   * Reacts to an `mp-connect` notification without trusting its payload (PRD 9.4, 11): checks with
   * Mercado Pago whether the store's token still works, and marks the store disconnected only if
   * the access was really revoked.
   */
  async reconcileAfterConnectNotification(
    mpUserId: string,
  ): Promise<'unknown_account' | 'still_connected' | 'disconnected'> {
    const connection = await this.findByMpUserId(mpUserId);
    if (!connection || connection.status === 'disconnected') return 'unknown_account';
    try {
      const accessToken = this.cipher.decrypt(
        connection.accessToken,
        accessContext(connection.channelId),
      );
      await this.api.checkToken(accessToken);
      return 'still_connected';
    } catch (error) {
      if (!(error instanceof MercadoPagoApiError) || error.kind !== 'auth') throw error;
    }
    try {
      await this.refresh(connection.channelId);
      return 'still_connected';
    } catch (error) {
      if (error instanceof MercadoPagoApiError && error.kind === 'unavailable') throw error;
      await this.markDisconnected(connection.channelId, 'Access was revoked from Mercado Pago.');
      return 'disconnected';
    }
  }

  async markDisconnected(channelId: ID, reason: string): Promise<void> {
    const connection = await this.findByChannelId(channelId);
    if (!connection) return;
    connection.status = 'disconnected';
    connection.lastError = reason.slice(0, MAX_ERROR_LENGTH);
    // Tokens are useless after a revocation, so they are not kept.
    connection.accessToken = '';
    connection.refreshToken = '';
    await this.repo.save(connection);
    this.eventBus.publish(
      new MercadoPagoAttentionEvent('account_disconnected', channelId, { message: reason }),
    );
  }

  private async doRefresh(channelId: ID): Promise<MercadoPagoConnection> {
    const current = await this.findByChannelId(channelId);
    if (!current || current.status === 'disconnected') throw new MercadoPagoNotConnectedError();
    try {
      const refreshToken = this.cipher.decrypt(current.refreshToken, refreshContext(channelId));
      const tokens = await this.api.refreshAccessToken(refreshToken);
      // The refresh token rotates: the new one must be stored (PRD 9.4).
      this.applyTokens(current, channelId, tokens);
      return await this.repo.save(current);
    } catch (error) {
      current.status = 'expiring';
      current.lastError = describeError(error);
      await this.repo.save(current);
      this.eventBus.publish(
        new MercadoPagoAttentionEvent('token_renewal_failed', channelId, {
          message: current.lastError,
        }),
      );
      throw error;
    }
  }

  private applyTokens(
    entity: MercadoPagoConnection,
    channelId: ID,
    tokens: OAuthTokenResponse,
  ): void {
    const ttlSeconds = tokens.expires_in ?? DEFAULT_TOKEN_TTL_SECONDS;
    entity.accessToken = this.cipher.encrypt(tokens.access_token, accessContext(channelId));
    entity.refreshToken = this.cipher.encrypt(tokens.refresh_token, refreshContext(channelId));
    entity.expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    if (tokens.scope !== undefined) entity.scope = tokens.scope;
    entity.status = 'connected';
    entity.lastError = null;
  }
}
