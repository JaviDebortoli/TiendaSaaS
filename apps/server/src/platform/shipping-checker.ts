import { LanguageCode, ShippingEligibilityChecker } from '@vendure/core';

export const ZONE_CHECKER_CODE = 'delivery-zone-eligibility-checker';

/**
 * Eligibility of the flat-rate delivery method (PRD 8): the shipping address must be in one of the
 * allowed countries, and the order may have to reach a minimum. Pickup uses Vendure's default
 * checker with no minimum and no address requirement.
 */
export const deliveryZoneChecker = new ShippingEligibilityChecker({
  code: ZONE_CHECKER_CODE,
  description: [{ languageCode: LanguageCode.en, value: 'Delivery zone and minimum order amount' }],
  args: {
    countries: {
      type: 'string',
      defaultValue: 'AR',
      label: [{ languageCode: LanguageCode.en, value: 'Allowed country codes, comma separated' }],
    },
    orderMinimum: {
      type: 'int',
      defaultValue: 0,
      ui: { component: 'currency-form-input' },
      label: [{ languageCode: LanguageCode.en, value: 'Minimum order amount' }],
    },
  },
  check: (ctx, order, args) => {
    const country = order.shippingAddress?.countryCode?.toUpperCase();
    const allowed = args.countries.split(',').map((c) => c.trim().toUpperCase());
    if (!country || !allowed.includes(country)) return false;
    const subtotal = ctx.channel.pricesIncludeTax ? order.subTotalWithTax : order.subTotal;
    return subtotal >= args.orderMinimum;
  },
});
