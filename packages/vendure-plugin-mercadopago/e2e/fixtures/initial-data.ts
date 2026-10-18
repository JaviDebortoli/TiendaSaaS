import { InitialData, LanguageCode } from '@vendure/core';

/** Minimal catalogue-independent data for integration tests: one zone, AR, 21% tax. */
export const initialData: InitialData = {
  defaultLanguage: LanguageCode.en,
  defaultZone: 'Argentina',
  countries: [{ name: 'Argentina', code: 'AR', zone: 'Argentina' }],
  taxRates: [
    { name: 'Standard Tax', percentage: 21 },
    { name: 'Zero Tax', percentage: 0 },
  ],
  shippingMethods: [],
  paymentMethods: [],
  collections: [],
};
