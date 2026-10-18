import { Injectable } from '@nestjs/common';
import {
  ChannelService,
  CountryService,
  GlobalSettingsService,
  LanguageCode,
  Logger,
  RequestContext,
  TaxCategoryService,
  TaxRateService,
  TransactionalConnection,
  ZoneService,
  CurrencyCode,
  Zone,
  Channel,
} from '@vendure/core';

export const loggerCtx = 'Platform';
export const ARGENTINA_ZONE = 'Argentina';
export const VAT_STANDARD = { name: 'IVA 21%', value: 21 };

export interface BaseData {
  zone: Zone;
  taxCategoryId: string | number;
  defaultChannel: Channel;
}

/**
 * Data every store of the platform needs and that lives outside any single channel: Argentina as
 * country and zone, VAT, Spanish, ARS. Safe to run on every start: it only creates what is missing.
 */
@Injectable()
export class BaseDataService {
  constructor(
    private readonly connection: TransactionalConnection,
    private readonly channelService: ChannelService,
    private readonly countryService: CountryService,
    private readonly zoneService: ZoneService,
    private readonly taxCategoryService: TaxCategoryService,
    private readonly taxRateService: TaxRateService,
    private readonly globalSettingsService: GlobalSettingsService,
  ) {}

  async ensure(ctx: RequestContext): Promise<BaseData> {
    const settings = await this.globalSettingsService.getSettings(ctx);
    const languages = new Set(settings.availableLanguages);
    if (!languages.has(LanguageCode.es)) {
      await this.globalSettingsService.updateSettings(ctx, {
        availableLanguages: [...languages, LanguageCode.es],
      });
    }

    let country = await this.countryService.findOneByCode(ctx, 'AR').catch(() => undefined);
    country ??= await this.countryService.create(ctx, {
      code: 'AR',
      enabled: true,
      translations: [
        { languageCode: LanguageCode.es, name: 'Argentina' },
        { languageCode: LanguageCode.en, name: 'Argentina' },
      ],
    });

    const zones = await this.zoneService.findAll(ctx, { take: 100 });
    const zone =
      zones.items.find((z) => z.name === ARGENTINA_ZONE) ??
      (await this.zoneService.create(ctx, { name: ARGENTINA_ZONE, memberIds: [country.id] }));

    const categories = await this.taxCategoryService.findAll(ctx, { take: 100 });
    const category =
      categories.items.find((c) => c.isDefault) ??
      categories.items[0] ??
      (await this.taxCategoryService.create(ctx, { name: 'Standard', isDefault: true }));

    const rates = await this.taxRateService.findAll(ctx, { take: 100 }, ['zone', 'category']);
    const hasRate = rates.items.some(
      (r) => String(r.zone.id) === String(zone.id) && r.value === VAT_STANDARD.value,
    );
    if (!hasRate) {
      await this.taxRateService.create(ctx, {
        name: VAT_STANDARD.name,
        enabled: true,
        value: VAT_STANDARD.value,
        categoryId: category.id,
        zoneId: zone.id,
      });
    }

    const defaultChannel = await this.channelService.getDefaultChannel(ctx);
    await this.alignDefaultChannel(ctx, defaultChannel, zone);
    Logger.verbose('Base data is in place', loggerCtx);
    return { zone, taxCategoryId: category.id, defaultChannel };
  }

  /**
   * The default channel holds a copy of every price, so it uses ARS like every store (PRD 5.2)
   * and Argentina as its tax and shipping zone.
   */
  private async alignDefaultChannel(
    ctx: RequestContext,
    channel: Channel,
    zone: Zone,
  ): Promise<void> {
    const needsUpdate =
      channel.defaultCurrencyCode !== CurrencyCode.ARS ||
      channel.defaultLanguageCode !== LanguageCode.es ||
      !channel.pricesIncludeTax ||
      String(channel.defaultTaxZone?.id) !== String(zone.id) ||
      String(channel.defaultShippingZone?.id) !== String(zone.id);
    if (!needsUpdate) return;
    const result = await this.channelService.update(ctx, {
      id: channel.id,
      defaultCurrencyCode: CurrencyCode.ARS,
      availableCurrencyCodes: [CurrencyCode.ARS],
      defaultLanguageCode: LanguageCode.es,
      availableLanguageCodes: [LanguageCode.es, LanguageCode.en],
      pricesIncludeTax: true,
      defaultTaxZoneId: zone.id,
      defaultShippingZoneId: zone.id,
    });
    if ('errorCode' in result) {
      Logger.warn(`Could not align the default channel: ${result.message}`, loggerCtx);
    }
  }
}
