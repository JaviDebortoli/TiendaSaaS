import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { adminApiExtensions, MercadoPagoAdminResolver } from './api/admin-api';
import { MercadoPagoOAuthController } from './api/oauth.controller';
import {
  CreateMercadoPagoCheckoutResultResolver,
  MercadoPagoShopResolver,
  shopApiExtensions,
  SyncMercadoPagoPaymentResultResolver,
} from './api/shop-api';
import { MercadoPagoWebhookController } from './api/webhook.controller';
import { MP_PLUGIN_OPTIONS } from './constants';
import { channelCustomFields } from './custom-fields';
import { MercadoPagoAccount } from './entities/mercadopago-account.entity';
import { MercadoPagoChannelLink } from './entities/mercadopago-channel-link.entity';
import { MercadoPagoOAuthState } from './entities/mercadopago-oauth-state.entity';
import { MercadoPagoPaymentClaim } from './entities/mercadopago-payment-claim.entity';
import { MercadoPagoPreference } from './entities/mercadopago-preference.entity';
import { SessionOrderByCodeAccessStrategy } from './order-access';
import { manageMercadoPago } from './permissions';
import { mercadoPagoConnectedChecker, mercadoPagoHandler } from './payment/mercadopago-handler';
import { MercadoPagoCipherService } from './services/cipher.service';
import { MercadoPagoCheckoutService } from './services/checkout.service';
import { MercadoPagoConnectionService } from './services/connection.service';
import { MercadoPagoApiService } from './services/mercadopago-api.service';
import { MercadoPagoOAuthService } from './services/oauth.service';
import { MercadoPagoPaymentOperations } from './services/payment-operations.service';
import { MercadoPagoPaymentProcessor } from './services/payment-processor.service';
import { MercadoPagoPreferenceRegistry } from './services/preference-registry.service';
import { MercadoPagoReleaseService } from './services/release.service';
import { MercadoPagoReviewService } from './services/review.service';
import { MercadoPagoWebhookService } from './services/webhook.service';
import { refreshConnectionsTask, releaseLinksTask } from './tasks';
import { MercadoPagoPluginOptions, resolveOptions, ResolvedMercadoPagoOptions } from './types';

@VendurePlugin({
  imports: [PluginCommonModule],
  entities: [
    MercadoPagoAccount,
    MercadoPagoChannelLink,
    MercadoPagoOAuthState,
    MercadoPagoPaymentClaim,
    MercadoPagoPreference,
  ],
  providers: [
    { provide: MP_PLUGIN_OPTIONS, useFactory: () => MercadoPagoPlugin.options },
    MercadoPagoCipherService,
    MercadoPagoApiService,
    MercadoPagoConnectionService,
    MercadoPagoOAuthService,
    MercadoPagoCheckoutService,
    MercadoPagoPaymentProcessor,
    MercadoPagoPaymentOperations,
    MercadoPagoReviewService,
    MercadoPagoPreferenceRegistry,
    MercadoPagoReleaseService,
    MercadoPagoWebhookService,
  ],
  controllers: [MercadoPagoOAuthController, MercadoPagoWebhookController],
  shopApiExtensions: {
    schema: shopApiExtensions,
    resolvers: [
      MercadoPagoShopResolver,
      CreateMercadoPagoCheckoutResultResolver,
      SyncMercadoPagoPaymentResultResolver,
    ],
  },
  adminApiExtensions: {
    schema: adminApiExtensions,
    resolvers: [MercadoPagoAdminResolver],
  },
  configuration: (config) => {
    config.paymentOptions.paymentMethodHandlers.push(mercadoPagoHandler);
    // The result screen reads the order while it is still being paid.
    config.orderOptions.orderByCodeAccessStrategy = new SessionOrderByCodeAccessStrategy(
      config.orderOptions.orderByCodeAccessStrategy,
    );
    config.paymentOptions.paymentMethodEligibilityCheckers = [
      ...(config.paymentOptions.paymentMethodEligibilityCheckers ?? []),
      mercadoPagoConnectedChecker,
    ];
    config.authOptions.customPermissions = [
      ...(config.authOptions.customPermissions ?? []),
      manageMercadoPago,
    ];
    config.customFields.Channel = [...(config.customFields.Channel ?? []), ...channelCustomFields];
    config.schedulerOptions.tasks = [
      ...(config.schedulerOptions.tasks ?? []),
      refreshConnectionsTask,
      releaseLinksTask,
    ];
    return config;
  },
  // Compiled next to this file; `npm run build` copies src/dashboard to dist/dashboard.
  dashboard: './dashboard/index.tsx',
  compatibility: '^3.0.0',
})
export class MercadoPagoPlugin {
  static options: ResolvedMercadoPagoOptions;

  static init(options: MercadoPagoPluginOptions): typeof MercadoPagoPlugin {
    this.options = resolveOptions(options);
    return this;
  }
}
