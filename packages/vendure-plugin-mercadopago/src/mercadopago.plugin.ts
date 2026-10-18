import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { adminApiExtensions, MercadoPagoAdminResolver } from './api/admin-api';
import { MercadoPagoOAuthController } from './api/oauth.controller';
import { MP_PLUGIN_OPTIONS } from './constants';
import { channelCustomFields } from './custom-fields';
import { MercadoPagoConnection } from './entities/mercadopago-connection.entity';
import { MercadoPagoOAuthState } from './entities/mercadopago-oauth-state.entity';
import { MercadoPagoPaymentClaim } from './entities/mercadopago-payment-claim.entity';
import { manageMercadoPago } from './permissions';
import { MercadoPagoCipherService } from './services/cipher.service';
import { MercadoPagoConnectionService } from './services/connection.service';
import { MercadoPagoApiService } from './services/mercadopago-api.service';
import { MercadoPagoOAuthService } from './services/oauth.service';
import { refreshConnectionsTask } from './tasks';
import { MercadoPagoPluginOptions, resolveOptions, ResolvedMercadoPagoOptions } from './types';

@VendurePlugin({
  imports: [PluginCommonModule],
  entities: [MercadoPagoConnection, MercadoPagoOAuthState, MercadoPagoPaymentClaim],
  providers: [
    { provide: MP_PLUGIN_OPTIONS, useFactory: () => MercadoPagoPlugin.options },
    MercadoPagoCipherService,
    MercadoPagoApiService,
    MercadoPagoConnectionService,
    MercadoPagoOAuthService,
  ],
  controllers: [MercadoPagoOAuthController],
  adminApiExtensions: {
    schema: adminApiExtensions,
    resolvers: [MercadoPagoAdminResolver],
  },
  configuration: (config) => {
    config.authOptions.customPermissions = [
      ...(config.authOptions.customPermissions ?? []),
      manageMercadoPago,
    ];
    config.customFields.Channel = [...(config.customFields.Channel ?? []), ...channelCustomFields];
    config.schedulerOptions.tasks = [
      ...(config.schedulerOptions.tasks ?? []),
      refreshConnectionsTask,
    ];
    return config;
  },
  compatibility: '^3.0.0',
})
export class MercadoPagoPlugin {
  static options: ResolvedMercadoPagoOptions;

  static init(options: MercadoPagoPluginOptions): typeof MercadoPagoPlugin {
    this.options = resolveOptions(options);
    return this;
  }
}
