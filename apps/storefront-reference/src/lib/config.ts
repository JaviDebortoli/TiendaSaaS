import 'server-only';

/**
 * Settings of this storefront, read from the server environment at request time (never at build
 * time, so one image serves any store). None of them is a secret: the channel token is the public
 * identifier of the store, and Mercado Pago credentials only exist on the Vendure server.
 */
export interface StorefrontConfig {
  /** Shop API URL. The storefront never talks to the Admin API. */
  apiUrl: string;
  /** Channel token of THIS store. Never the default channel's. */
  channelToken: string;
  /** Public URL of this storefront. Mercado Pago sends the buyer back to it. */
  publicUrl: string;
  storeName: string;
  /** How the shared platform account is called to buyers. */
  platformName: string;
  /** After this long without a webhook, the result page asks the server to check the payment. */
  syncAfterMs: number;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

export function getConfig(): StorefrontConfig {
  return {
    apiUrl: required('VENDURE_SHOP_API_URL'),
    channelToken: required('VENDURE_CHANNEL_TOKEN'),
    publicUrl: required('STOREFRONT_PUBLIC_URL').replace(/\/$/, ''),
    storeName: process.env.STORE_NAME?.trim() || 'Tienda',
    platformName: process.env.PLATFORM_NAME?.trim() || 'la plataforma',
    syncAfterMs: Number(process.env.PAYMENT_SYNC_AFTER_MS ?? 10_000),
  };
}
