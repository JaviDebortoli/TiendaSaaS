import { Args, Mutation, ResolveField, Resolver } from '@nestjs/graphql';
import { ErrorCode } from '@vendure/common/lib/generated-shop-types';
import { Ctx, ErrorResult, Logger, RequestContext } from '@vendure/core';
import gql from 'graphql-tag';
import { loggerCtx } from '../constants';
import { BackUrls, CheckoutError, MercadoPagoCheckoutService } from '../services/checkout.service';
import { MercadoPagoApiError } from '../services/mercadopago-api.service';
import { MercadoPagoPaymentProcessor } from '../services/payment-processor.service';

export const shopApiExtensions = gql`
  input MercadoPagoCheckoutInput {
    "Code of the active order. It must be in the ArrangingPayment state."
    orderCode: String!
    "Pages of the store's storefront Mercado Pago sends the buyer back to."
    successUrl: String!
    failureUrl: String!
    pendingUrl: String!
  }

  type MercadoPagoCheckout {
    preferenceId: String!
    "Where to redirect the buyer to pay."
    initPoint: String!
    sandboxInitPoint: String
    expiresAt: DateTime!
  }

  extend enum ErrorCode {
    MERCADOPAGO_ERROR
  }

  type MercadoPagoError implements ErrorResult {
    errorCode: ErrorCode!
    message: String!
    reason: String!
  }

  union CreateMercadoPagoCheckoutResult = MercadoPagoCheckout | MercadoPagoError

  type MercadoPagoPaymentSync {
    """
    settled | already_settled | pending | rejected | cancelled | reversed | unknown | needs_review
    """
    outcome: String!
    orderCode: String!
    orderState: String!
  }

  union SyncMercadoPagoPaymentResult = MercadoPagoPaymentSync | MercadoPagoError

  extend type Mutation {
    "Creates the Mercado Pago preference of the active order and returns where to send the buyer."
    createMercadoPagoCheckout(input: MercadoPagoCheckoutInput!): CreateMercadoPagoCheckoutResult!
    """
    Fallback when the webhook is late: asks Mercado Pago for the state of the payment with the
    token of the account that issued the preference, and applies the same rules as the webhook.
    externalReference is the reference of the preference, exactly as Mercado Pago returned it
    (it is looked up whole, never parsed), and paymentId the payment of the redirect. Both are
    only pointers: they never confirm anything by themselves. An unknown reference answers
    'unknown' without asking Mercado Pago anything.
    """
    syncMercadoPagoPayment(
      externalReference: String!
      paymentId: String!
    ): SyncMercadoPagoPaymentResult!
  }
`;

export class MercadoPagoError extends ErrorResult {
  override readonly __typename = 'MercadoPagoError';
  override readonly errorCode = 'MERCADOPAGO_ERROR' as unknown as ErrorCode;
  override readonly message: string;

  constructor(
    readonly reason: string,
    message: string,
  ) {
    super();
    this.message = message;
  }
}

@Resolver()
export class MercadoPagoShopResolver {
  constructor(
    private readonly checkout: MercadoPagoCheckoutService,
    private readonly processor: MercadoPagoPaymentProcessor,
  ) {}

  @Mutation()
  async createMercadoPagoCheckout(
    @Ctx() ctx: RequestContext,
    @Args('input') input: { orderCode: string } & BackUrls,
  ) {
    try {
      const result = await this.checkout.createCheckout(ctx, input.orderCode, {
        successUrl: input.successUrl,
        failureUrl: input.failureUrl,
        pendingUrl: input.pendingUrl,
      });
      return { __typename: 'MercadoPagoCheckout', ...result };
    } catch (error) {
      if (error instanceof CheckoutError) return new MercadoPagoError(error.reason, error.message);
      throw error;
    }
  }

  @Mutation()
  async syncMercadoPagoPayment(
    @Ctx() ctx: RequestContext,
    @Args('externalReference') externalReference: string,
    @Args('paymentId') paymentId: string,
  ) {
    try {
      const result = await this.processor.process({
        mpPaymentId: paymentId,
        channelId: ctx.channelId,
        externalReference,
      });
      if (result.outcome === 'ignored' && result.reason === 'unknown_preference') {
        // Nothing was issued under that reference: say "unknown" without revealing anything.
        return {
          __typename: 'MercadoPagoPaymentSync',
          outcome: 'unknown',
          orderCode: '',
          orderState: '',
        };
      }
      if (result.outcome === 'ignored') {
        return new MercadoPagoError(
          result.reason.toUpperCase(),
          'The payment could not be matched to the order.',
        );
      }
      return {
        __typename: 'MercadoPagoPaymentSync',
        outcome: result.outcome,
        orderCode: result.orderCode,
        orderState: result.orderState,
      };
    } catch (error) {
      Logger.warn(
        `Sync of payment ${paymentId} failed: ${error instanceof Error ? error.message : String(error)}`,
        loggerCtx,
      );
      if (error instanceof MercadoPagoApiError) {
        return new MercadoPagoError(
          'MERCADOPAGO_UNAVAILABLE',
          'Mercado Pago did not answer. Try again in a moment.',
        );
      }
      return new MercadoPagoError(
        'SYNC_FAILED',
        'The payment could not be synchronised yet. Try again in a moment.',
      );
    }
  }
}

@Resolver('CreateMercadoPagoCheckoutResult')
export class CreateMercadoPagoCheckoutResultResolver {
  @ResolveField()
  __resolveType(value: { __typename: string }): string {
    return value.__typename;
  }
}

@Resolver('SyncMercadoPagoPaymentResult')
export class SyncMercadoPagoPaymentResultResolver {
  @ResolveField()
  __resolveType(value: { __typename: string }): string {
    return value.__typename;
  }
}
