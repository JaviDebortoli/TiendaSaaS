import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { DEFAULT_CHANNEL_CODE } from '@vendure/common/lib/shared-constants';
import { Allow, Ctx, Permission, RequestContext, UserInputError } from '@vendure/core';
import gql from 'graphql-tag';
import { manageMercadoPago } from '../permissions';
import { MercadoPagoConnectionService } from '../services/connection.service';
import { MercadoPagoOAuthService } from '../services/oauth.service';
import { MercadoPagoPaymentProcessor } from '../services/payment-processor.service';

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
    "Cancels a payment that is still pending or in process (e.g. an unpaid Rapipago voucher)."
    cancelMercadoPagoPayment(paymentId: String!): Boolean!
  }
`;

@Resolver()
export class MercadoPagoAdminResolver {
  constructor(
    private readonly connections: MercadoPagoConnectionService,
    private readonly oauth: MercadoPagoOAuthService,
    private readonly processor: MercadoPagoPaymentProcessor,
  ) {}

  @Query()
  @Allow(manageMercadoPago.Permission)
  async mercadoPagoConnection(@Ctx() ctx: RequestContext) {
    const account = await this.connections.findActiveAccount(ctx.channelId);
    if (!account) return null;
    return {
      connected: this.connections.isUsable(account),
      status: account.status,
      mpUserId: account.mpUserId,
      expiresAt: account.expiresAt,
      scope: account.scope,
      lastError: account.lastError,
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
    return this.connections.retire(ctx.channelId);
  }

  @Mutation()
  @Allow(Permission.UpdateOrder)
  async cancelMercadoPagoPayment(
    @Ctx() ctx: RequestContext,
    @Args('paymentId') paymentId: string,
  ): Promise<boolean> {
    await this.processor.cancelPending(ctx, paymentId);
    return true;
  }
}
