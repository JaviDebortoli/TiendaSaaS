import { CustomFieldConfig, LanguageCode, Permission } from '@vendure/core';

declare module '@vendure/core/dist/entity/custom-entity-fields' {
  interface CustomChannelFields {
    /** Public URL of the store's frontend. Mercado Pago return URLs must belong to it. */
    mpStorefrontUrl?: string | null;
  }
}

export const STOREFRONT_URL_FIELD = 'mpStorefrontUrl';

export const channelCustomFields: CustomFieldConfig[] = [
  {
    name: STOREFRONT_URL_FIELD,
    type: 'string',
    nullable: true,
    public: false,
    readonly: false,
    requiresPermission: [Permission.SuperAdmin],
    label: [{ languageCode: LanguageCode.en, value: 'Storefront URL' }],
    description: [
      {
        languageCode: LanguageCode.en,
        value:
          'Public https URL of this store. Mercado Pago return URLs are only accepted on this origin.',
      },
    ],
  },
];
