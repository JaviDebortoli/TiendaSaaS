import { OnApplicationBootstrap } from '@nestjs/common';
import { PluginCommonModule, RequestContextService, VendurePlugin } from '@vendure/core';
import { BaseDataService } from './base-data.service';
import { sellerCustomFields } from './custom-fields';
import { ProvisioningResolver, provisioningApiExtensions } from './provisioning.api';
import { StoreProvisioningService } from './provisioning.service';
import { deliveryZoneChecker } from './shipping-checker';

/**
 * Everything the platform adds on top of Vendure that is not about payments: store details on the
 * Seller, the delivery-zone checker and the store provisioning operation (PRD 5.4, 8).
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [BaseDataService, StoreProvisioningService],
  adminApiExtensions: {
    schema: provisioningApiExtensions,
    resolvers: [ProvisioningResolver],
  },
  configuration: (config) => {
    config.customFields.Seller = [...(config.customFields.Seller ?? []), ...sellerCustomFields];
    config.shippingOptions.shippingEligibilityCheckers = [
      ...(config.shippingOptions.shippingEligibilityCheckers ?? []),
      deliveryZoneChecker,
    ];
    return config;
  },
  compatibility: '^3.0.0',
})
export class PlatformPlugin implements OnApplicationBootstrap {
  private static ensureBaseDataOnBootstrap = true;

  /** `ensureBaseData: false` is for tests that load their own initial data first. */
  static init(options: { ensureBaseData?: boolean } = {}): typeof PlatformPlugin {
    this.ensureBaseDataOnBootstrap = options.ensureBaseData ?? true;
    return this;
  }

  constructor(
    private readonly requestContextService: RequestContextService,
    private readonly baseData: BaseDataService,
  ) {}

  /** Keeps Argentina, VAT, Spanish and ARS in place on every start. */
  async onApplicationBootstrap(): Promise<void> {
    if (!PlatformPlugin.ensureBaseDataOnBootstrap) return;
    const ctx = await this.requestContextService.create({ apiType: 'admin' });
    await this.baseData.ensure(ctx);
  }
}

export { BaseDataService, StoreProvisioningService };
