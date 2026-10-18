import { Injectable } from '@nestjs/common';
import {
  AdministratorService,
  Channel,
  ChannelService,
  CurrencyCode,
  ID,
  LanguageCode,
  Logger,
  PaymentMethodService,
  Permission,
  RequestContext,
  RoleService,
  SellerService,
  ShippingMethodService,
  StockLocationService,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core';
import { randomBytes } from 'node:crypto';
import { BaseDataService, loggerCtx } from './base-data.service';
import { STORE_OWNER_PERMISSIONS } from './permissions';
import { ZONE_CHECKER_CODE } from './shipping-checker';

export interface ProvisionStoreInput {
  /** Name of the store (becomes the Seller name). */
  name: string;
  /** Channel code: lower case letters, digits and dashes. */
  code: string;
  /** Channel token the storefront sends as `vendure-token`. Generated when omitted. */
  token?: string;
  /** Public https URL of the storefront. Return URLs of Mercado Pago must belong to it. */
  storefrontUrl?: string;
  ownerEmail: string;
  ownerFirstName: string;
  ownerLastName: string;
  /** Generated and returned once when omitted. */
  ownerPassword?: string;
  contactEmail?: string;
  cuit?: string;
  logoUrl?: string;
  /** Flat delivery fee in cents (ARS, taxes included). Default 0. */
  flatRate?: number;
  /** Minimum order amount in cents for flat-rate delivery. Default 0. */
  flatRateMinimum?: number;
}

export interface ProvisionedStore {
  sellerId: ID;
  channelId: ID;
  channelCode: string;
  token: string;
  administratorEmail: string;
  /** Only set when it was generated here: it is not stored anywhere else. */
  generatedPassword: string | null;
  stockLocationId: ID;
  shippingMethodIds: ID[];
  paymentMethodId: ID;
}

const CODE_PATTERN = /^[a-z0-9][a-z0-9-]{1,40}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCAL_HOST = /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$)/i;

function assertStorefrontUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UserInputError('storefrontUrl must be a valid URL.');
  }
  if (url.protocol !== 'https:' || LOCAL_HOST.test(url.hostname)) {
    throw new UserInputError(
      'storefrontUrl must be a public https URL (Mercado Pago does not accept local return URLs).',
    );
  }
  return url.origin;
}

function assertCents(value: number | undefined, field: string): number {
  const cents = value ?? 0;
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new UserInputError(`${field} must be a non-negative integer number of cents.`);
  }
  return cents;
}

/**
 * Creates a store in one atomic operation (PRD 5.4): seller, channel, a role limited to that
 * channel with its owner administrator, stock location, the two delivery methods and the Mercado
 * Pago payment method. Everything runs in one transaction: a failure leaves nothing behind.
 */
@Injectable()
export class StoreProvisioningService {
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly baseData: BaseDataService,
    private readonly sellerService: SellerService,
    private readonly channelService: ChannelService,
    private readonly roleService: RoleService,
    private readonly administratorService: AdministratorService,
    private readonly stockLocationService: StockLocationService,
    private readonly shippingMethodService: ShippingMethodService,
    private readonly paymentMethodService: PaymentMethodService,
  ) {}

  async provision(ctx: RequestContext, input: ProvisionStoreInput): Promise<ProvisionedStore> {
    const request = this.validate(input);
    const store = await this.connection.withTransaction(ctx, async (tx) => {
      const base = await this.baseData.ensure(tx);
      await this.assertAvailable(tx, request);

      const seller = await this.sellerService.create(tx, {
        name: request.name,
        customFields: {
          cuit: request.cuit ?? null,
          contactEmail: request.contactEmail ?? null,
          logoUrl: request.logoUrl ?? null,
        },
      });

      const created = await this.channelService.create(tx, {
        code: request.code,
        token: request.token,
        sellerId: seller.id,
        defaultLanguageCode: LanguageCode.es,
        availableLanguageCodes: [LanguageCode.es, LanguageCode.en],
        defaultCurrencyCode: CurrencyCode.ARS,
        availableCurrencyCodes: [CurrencyCode.ARS],
        pricesIncludeTax: true,
        defaultTaxZoneId: base.zone.id,
        defaultShippingZoneId: base.zone.id,
        customFields: { mpStorefrontUrl: request.storefrontOrigin ?? null },
      });
      if ('errorCode' in created) throw new UserInputError(created.message);
      const channel = created as Channel;

      const role = await this.roleService.create(tx, {
        code: `${request.code}-owner`,
        description: `Owner of ${request.name}`,
        permissions: STORE_OWNER_PERMISSIONS as Permission[],
        channelIds: [channel.id],
      });
      await this.administratorService.create(tx, {
        emailAddress: request.ownerEmail,
        firstName: request.ownerFirstName,
        lastName: request.ownerLastName,
        password: request.ownerPassword,
        roleIds: [role.id],
      });

      const stockLocation = await this.stockLocationService.create(tx, {
        name: request.name,
        description: `Stock of ${request.name}`,
      });
      await this.stockLocationService.assignStockLocationsToChannel(tx, {
        stockLocationIds: [stockLocation.id],
        channelId: channel.id,
      });

      const shippingMethods = [
        await this.shippingMethodService.create(tx, {
          code: `${request.code}-pickup`,
          fulfillmentHandler: 'manual-fulfillment',
          checker: {
            code: 'default-shipping-eligibility-checker',
            arguments: [{ name: 'orderMinimum', value: '0' }],
          },
          calculator: {
            code: 'default-shipping-calculator',
            arguments: this.calculatorArgs(0),
          },
          translations: [
            {
              languageCode: LanguageCode.es,
              name: 'Retiro en el local',
              description: 'Retirás tu pedido en el local, sin costo.',
            },
          ],
        }),
        await this.shippingMethodService.create(tx, {
          code: `${request.code}-flat-rate`,
          fulfillmentHandler: 'manual-fulfillment',
          checker: {
            code: ZONE_CHECKER_CODE,
            arguments: [
              { name: 'countries', value: 'AR' },
              { name: 'orderMinimum', value: String(request.flatRateMinimum) },
            ],
          },
          calculator: {
            code: 'default-shipping-calculator',
            arguments: this.calculatorArgs(request.flatRate),
          },
          translations: [
            {
              languageCode: LanguageCode.es,
              name: 'Envío a domicilio',
              description: 'Tarifa fija de envío.',
            },
          ],
        }),
      ];
      await this.shippingMethodService.assignShippingMethodsToChannel(tx, {
        shippingMethodIds: shippingMethods.map((m) => m.id),
        channelId: channel.id,
      });

      const paymentMethod = await this.paymentMethodService.create(tx, {
        code: 'mercado-pago',
        enabled: true,
        handler: { code: 'mercado-pago', arguments: [] },
        checker: { code: 'mercado-pago-connected', arguments: [] },
        translations: [
          {
            languageCode: LanguageCode.es,
            name: 'Mercado Pago',
            description: 'Pagás con Mercado Pago.',
          },
        ],
      });
      await this.paymentMethodService.assignPaymentMethodsToChannel(tx, {
        paymentMethodIds: [paymentMethod.id],
        channelId: channel.id,
      });

      return {
        sellerId: seller.id,
        channelId: channel.id,
        channelCode: channel.code,
        token: channel.token,
        administratorEmail: request.ownerEmail,
        generatedPassword: request.passwordWasGenerated ? request.ownerPassword : null,
        stockLocationId: stockLocation.id,
        shippingMethodIds: shippingMethods.map((m) => m.id),
        paymentMethodId: paymentMethod.id,
      } satisfies ProvisionedStore;
    });
    Logger.info(`Provisioned store "${store.channelCode}"`, loggerCtx);
    return store;
  }

  /**
   * Prices include taxes and the flat fee is what the buyer pays: `include` with a 0% rate keeps
   * the configured amount exactly (PRD V8, covered by tests).
   */
  private calculatorArgs(rate: number) {
    return [
      { name: 'rate', value: String(rate) },
      { name: 'includesTax', value: 'include' },
      { name: 'taxRate', value: '0' },
    ];
  }

  private validate(input: ProvisionStoreInput) {
    const name = input.name?.trim();
    if (!name) throw new UserInputError('name is required.');
    const code = input.code?.trim();
    if (!code || !CODE_PATTERN.test(code)) {
      throw new UserInputError(
        'code must be 2-41 characters: lower case letters, digits and dashes, not starting with a dash.',
      );
    }
    const token = input.token?.trim() || randomBytes(18).toString('base64url');
    if (!TOKEN_PATTERN.test(token)) {
      throw new UserInputError(
        'token must be 8-64 characters: letters, digits, dash or underscore.',
      );
    }
    const ownerEmail = input.ownerEmail?.trim().toLowerCase();
    if (!ownerEmail || !EMAIL_PATTERN.test(ownerEmail)) {
      throw new UserInputError('ownerEmail must be a valid email address.');
    }
    if (!input.ownerFirstName?.trim() || !input.ownerLastName?.trim()) {
      throw new UserInputError('ownerFirstName and ownerLastName are required.');
    }
    const passwordWasGenerated = !input.ownerPassword;
    const ownerPassword = input.ownerPassword ?? randomBytes(15).toString('base64url');
    if (ownerPassword.length < 10) {
      throw new UserInputError('ownerPassword must have at least 10 characters.');
    }
    return {
      name,
      code,
      token,
      ownerEmail,
      ownerFirstName: input.ownerFirstName.trim(),
      ownerLastName: input.ownerLastName.trim(),
      ownerPassword,
      passwordWasGenerated,
      storefrontOrigin: input.storefrontUrl ? assertStorefrontUrl(input.storefrontUrl) : undefined,
      contactEmail: input.contactEmail?.trim() || undefined,
      cuit: input.cuit?.trim() || undefined,
      logoUrl: input.logoUrl?.trim() || undefined,
      flatRate: assertCents(input.flatRate, 'flatRate'),
      flatRateMinimum: assertCents(input.flatRateMinimum, 'flatRateMinimum'),
    };
  }

  private async assertAvailable(
    ctx: RequestContext,
    request: { code: string; token: string; ownerEmail: string },
  ): Promise<void> {
    const channels = this.connection.getRepository(ctx, Channel);
    if (await channels.findOneBy({ code: request.code })) {
      throw new UserInputError(`A store with the code "${request.code}" already exists.`);
    }
    if (await channels.findOneBy({ token: request.token })) {
      throw new UserInputError('That channel token is already in use.');
    }
    const admins = await this.administratorService.findAll(ctx, {
      filter: { emailAddress: { eq: request.ownerEmail } },
    });
    if (admins.totalItems > 0) {
      throw new UserInputError(
        `An administrator with the email "${request.ownerEmail}" already exists.`,
      );
    }
  }
}
