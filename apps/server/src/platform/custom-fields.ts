import { CustomFieldConfig, LanguageCode } from '@vendure/core';

declare module '@vendure/core/dist/entity/custom-entity-fields' {
  interface CustomSellerFields {
    cuit?: string | null;
    contactEmail?: string | null;
    logoUrl?: string | null;
  }
}

/** Store details kept on the Seller of each channel (PRD 5.1). */
export const sellerCustomFields: CustomFieldConfig[] = [
  {
    name: 'cuit',
    type: 'string',
    nullable: true,
    label: [{ languageCode: LanguageCode.en, value: 'CUIT' }],
  },
  {
    name: 'contactEmail',
    type: 'string',
    nullable: true,
    label: [{ languageCode: LanguageCode.en, value: 'Contact email' }],
  },
  {
    name: 'logoUrl',
    type: 'string',
    nullable: true,
    label: [{ languageCode: LanguageCode.en, value: 'Logo URL' }],
  },
];
