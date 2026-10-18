import { Mutation, Query, Resolver } from '@nestjs/graphql';
import { DEFAULT_CHANNEL_CODE } from '@vendure/common/lib/shared-constants';
import { Allow, Ctx, RequestContext, UserInputError } from '@vendure/core';
import gql from 'graphql-tag';
import { manageMercadoPago } from '../permissions';
import { MercadoPagoConnectionService } from '../services/connection.service';
import { MercadoPagoOAuthService } from '../services/oauth.service';

export const adminApiExtensions = gql`
  """
  Connection state of the active channel's Mercado Pago account. Tokens are never exposed.
  """
  type MercadoPagoConnectionInfo {
    connected: Boolean!
    status: String!
    mpUserId: String
    expiresAt: DateTime
    scope: String
    lastError: String
  }

  extend type Query {
    mercadoPagoConnection: MercadoPagoConnectionInfo
  }

  extend type Mutation {
    "Returns the Mercado Pago authorization URL the store owner must open to link their account."
    startMercadoPagoConnection: String!
    disconnectMercadoPago: Boolean!
  }
`;

@Resolver()
export class MercadoPagoAdminResolver {
  constructor(
    private readonly connections: MercadoPagoConnectionService,
    private readonly oauth: MercadoPagoOAuthService,
  ) {}

  @Query()
  @Allow(manageMercadoPago.Permission)
  async mercadoPagoConnection(@Ctx() ctx: RequestContext) {
    const connection = await this.connections.findByChannelId(ctx.channelId);
    if (!connection) return null;
    return {
      connected: this.connections.isUsable(connection),
      status: connection.status,
      mpUserId: connection.mpUserId,
      expiresAt: connection.expiresAt,
      scope: connection.scope,
      lastError: connection.lastError,
    };
  }

  @Mutation()
  @Allow(manageMercadoPago.Permission)
  async startMercadoPagoConnection(@Ctx() ctx: RequestContext): Promise<string> {
    // The default channel holds every entity and is never a store (PRD 5.2).
    if (ctx.channel.code === DEFAULT_CHANNEL_CODE) {
      throw new UserInputError('Select a store channel before connecting Mercado Pago.');
    }
    return this.oauth.createAuthorizationUrl(ctx.channelId);
  }

  @Mutation()
  @Allow(manageMercadoPago.Permission)
  async disconnectMercadoPago(@Ctx() ctx: RequestContext): Promise<boolean> {
    return this.connections.disconnect(ctx.channelId);
  }
}
