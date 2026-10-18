import { Inject, Injectable } from '@nestjs/common';
import { ID, Logger, TransactionalConnection } from '@vendure/core';
import { IsNull, MoreThan } from 'typeorm';
import { loggerCtx, MP_PLUGIN_OPTIONS, OFFLINE_ACCESS_SCOPE } from '../constants';
import { MercadoPagoOAuthState } from '../entities/mercadopago-oauth-state.entity';
import { codeChallengeS256, generateCodeVerifier, generateState } from '../lib/pkce';
import type { ResolvedMercadoPagoOptions } from '../types';
import { MercadoPagoCipherService } from './cipher.service';
import { AccountAlreadyLinkedError, MercadoPagoConnectionService } from './connection.service';
import { MercadoPagoApiError, MercadoPagoApiService } from './mercadopago-api.service';

/** The authorization code lives 10 minutes (documented), so the state does not need longer. */
const STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthFailureReason =
  | 'not_configured'
  | 'invalid_state'
  | 'access_denied'
  | 'account_already_linked'
  | 'missing_offline_access'
  | 'exchange_failed';

export type OAuthCompletion =
  { ok: true; channelId: ID } | { ok: false; reason: OAuthFailureReason; message: string };

const stateContext = (state: string) => `mp-oauth-state:${state}`;

@Injectable()
export class MercadoPagoOAuthService {
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly cipher: MercadoPagoCipherService,
    private readonly api: MercadoPagoApiService,
    private readonly connections: MercadoPagoConnectionService,
    @Inject(MP_PLUGIN_OPTIONS) private readonly options: ResolvedMercadoPagoOptions,
  ) {}

  private get states() {
    return this.connection.rawConnection.getRepository(MercadoPagoOAuthState);
  }

  /** Builds the authorization URL for a channel and stores its state and PKCE verifier. */
  async createAuthorizationUrl(channelId: ID): Promise<string> {
    if (!this.options.clientId || !this.options.redirectUri) {
      throw new Error(
        'Mercado Pago is not configured: MP_CLIENT_ID and MP_REDIRECT_URI are required.',
      );
    }
    const state = generateState();
    const verifier = generateCodeVerifier();
    await this.states.save(
      this.states.create({
        state,
        channelId,
        codeVerifier: this.cipher.encrypt(verifier, stateContext(state)),
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
        consumedAt: null,
      }),
    );
    const url = new URL('/authorization', this.options.authUrl);
    url.search = new URLSearchParams({
      client_id: this.options.clientId,
      response_type: 'code',
      platform_id: 'mp',
      state,
      redirect_uri: this.options.redirectUri,
      code_challenge: codeChallengeS256(verifier),
      code_challenge_method: 'S256',
    }).toString();
    return url.toString();
  }

  /**
   * Finishes the flow for the callback `redirect_uri?code=...&state=...` (PRD 9.2). Nothing is
   * stored unless every check passes.
   */
  async complete(params: {
    code?: string;
    state?: string;
    error?: string;
  }): Promise<OAuthCompletion> {
    const consumed = params.state ? await this.consumeState(params.state) : undefined;
    if (!consumed) {
      return {
        ok: false,
        reason: 'invalid_state',
        message: 'The authorization link is invalid or expired.',
      };
    }
    if (params.error || !params.code) {
      return {
        ok: false,
        reason: 'access_denied',
        message: 'Mercado Pago authorization was not granted.',
      };
    }

    try {
      const verifier = this.cipher.decrypt(consumed.codeVerifier, stateContext(consumed.state));
      const tokens = await this.api.exchangeAuthorizationCode(params.code, verifier);
      const scopes = (tokens.scope ?? '').split(/[\s,]+/);
      if (this.options.requireOfflineAccess && !scopes.includes(OFFLINE_ACCESS_SCOPE)) {
        return {
          ok: false,
          reason: 'missing_offline_access',
          message:
            'The authorization did not include offline access, so the connection could not be renewed.',
        };
      }
      await this.connections.link(consumed.channelId, tokens);
      return { ok: true, channelId: consumed.channelId };
    } catch (error) {
      if (error instanceof AccountAlreadyLinkedError) {
        return { ok: false, reason: 'account_already_linked', message: error.message };
      }
      Logger.warn(
        `Mercado Pago OAuth exchange failed: ${error instanceof Error ? error.message : String(error)}`,
        loggerCtx,
      );
      const detail = error instanceof MercadoPagoApiError ? ` (${error.kind})` : '';
      return {
        ok: false,
        reason: 'exchange_failed',
        message: `Could not complete the Mercado Pago connection${detail}. Try again.`,
      };
    }
  }

  /**
   * Single use: the update only matches while `consumedAt` is null, so two callbacks with the same
   * state cannot both succeed even if they run at the same time.
   */
  private async consumeState(state: string): Promise<MercadoPagoOAuthState | undefined> {
    const now = new Date();
    const result = await this.states.update(
      { state, consumedAt: IsNull(), expiresAt: MoreThan(now) },
      { consumedAt: now },
    );
    if (!result.affected) return undefined;
    return (await this.states.findOneBy({ state })) ?? undefined;
  }

  /** Housekeeping: drops states that can no longer be used. */
  async purgeExpiredStates(): Promise<void> {
    await this.states
      .createQueryBuilder()
      .delete()
      .where('expiresAt < :cutoff', { cutoff: new Date(Date.now() - STATE_TTL_MS) })
      .execute();
  }
}
