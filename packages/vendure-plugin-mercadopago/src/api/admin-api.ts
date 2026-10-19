import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { DEFAULT_CHANNEL_CODE } from '@vendure/common/lib/shared-constants';
import { Inject } from '@nestjs/common';
import { Allow, Ctx, ID, Permission, RequestContext, UserInputError } from '@vendure/core';
import gql from 'graphql-tag';
import { MP_PLUGIN_OPTIONS } from '../constants';
import { manageMercadoPago } from '../permissions';
import { MercadoPagoConnectionService } from '../services/connection.service';
import { MercadoPagoOAuthService } from '../services/oauth.service';
import { MercadoPagoPaymentProcessor } from '../services/payment-processor.service';
import { MercadoPagoReleaseService } from '../services/release.service';
import type { ResolvedMercadoPagoOptions } from '../types';

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

  """
  A store's link to a Mercado Pago account. Tokens are never exposed.
  """
  type MercadoPagoLinkInfo {
    id: ID!
    channelId: ID!
    mpUserId: String!
    "active | retired | released"
    status: String!
    "connected | expiring | disconnected | released"
    accountStatus: String!
    linkedAt: DateTime!
    retiredAt: DateTime
    releasedAt: DateTime
    "When a retired link is released, if no new payment arrives before."
    estimatedReleaseAt: DateTime
  }

  type MercadoPagoReleasePreview {
    link: MercadoPagoLinkInfo!
    """
    Settled payments of the link still inside the refund period. An upper bound: refunds already
    made are not subtracted.
    """
    refundablePayments: Int!
    refundPeriodDays: Int!
  }

  input ReleaseMercadoPagoLinkInput {
    linkId: ID!
    "Must be true. Read mercadoPagoReleasePreview first: released sales can no longer be refunded here."
    confirm: Boolean!
  }

  extend type Query {
    mercadoPagoConnection: MercadoPagoConnectionInfo
    "Accounts the active channel used before (retired or released), newest first."
    mercadoPagoPreviousAccounts: [MercadoPagoLinkInfo!]!
    "Superadmin only: every link of a store."
    mercadoPagoChannelLinks(channelId: ID!): [MercadoPagoLinkInfo!]!
    "Superadmin only: how many payments releasing the link now would stop being refundable."
    mercadoPagoReleasePreview(linkId: ID!): MercadoPagoReleasePreview!
  }

  extend type Mutation {
    "Returns the Mercado Pago authorization URL the store owner must open to link their account."
    startMercadoPagoConnection: String!
    """
    Stops the store from selling with its Mercado Pago account. Deletes nothing: its past sales can
    still be refunded and its pending payments are still processed.
    """
    disconnectMercadoPago: Boolean!
    "Superadmin only: retires the account a store sells with (a closed store whose owner is gone)."
    retireMercadoPagoAccount(channelId: ID!): Boolean!
    "Superadmin only: releases a retired link now, whatever its refund period."
    releaseMercadoPagoLink(input: ReleaseMercadoPagoLinkInput!): MercadoPagoLinkInfo!
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
    private readonly releases: MercadoPagoReleaseService,
    @Inject(MP_PLUGIN_OPTIONS) private readonly options: ResolvedMercadoPagoOptions,
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

  @Query()
  @Allow(manageMercadoPago.Permission)
  async mercadoPagoPreviousAccounts(@Ctx() ctx: RequestContext) {
    return this.releases.previousLinks(ctx.channelId);
  }

  @Query()
  @Allow(Permission.SuperAdmin)
  async mercadoPagoChannelLinks(@Args('channelId') channelId: ID) {
    const links = await this.connections.listLinks(channelId);
    return Promise.all(links.map((link) => this.releases.summarize(link)));
  }

  @Query()
  @Allow(Permission.SuperAdmin)
  async mercadoPagoReleasePreview(@Args('linkId') linkId: ID) {
    const link = await this.releases.findLink(linkId);
    if (!link) throw new UserInputError('No such link.');
    return {
      link: await this.releases.summarize(link),
      refundablePayments: await this.releases.refundablePayments(link),
      refundPeriodDays: this.options.releaseAfterLastPaymentDays,
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
  @Allow(Permission.SuperAdmin)
  async retireMercadoPagoAccount(@Args('channelId') channelId: ID): Promise<boolean> {
    return this.connections.retire(channelId);
  }

  @Mutation()
  @Allow(Permission.SuperAdmin)
  async releaseMercadoPagoLink(@Args('input') input: { linkId: ID; confirm: boolean }) {
    if (input.confirm !== true) {
      throw new UserInputError(
        'Confirm the release with confirm: true. Look at mercadoPagoReleasePreview first: once released, the sales of this link can no longer be refunded from here.',
      );
    }
    return this.releases.releaseLinkNow(input.linkId);
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
