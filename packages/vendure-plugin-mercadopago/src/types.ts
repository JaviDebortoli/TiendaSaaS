export type WebhookMode = 'application' | 'preference';
export type PreferenceItemsMode = 'lines' | 'total';

export interface MercadoPagoPluginOptions {
  /** Mercado Pago application id (PRD 9.1). */
  clientId: string;
  clientSecret: string;
  /** Secret key generated in "Tus integraciones" > Webhooks, used to validate `x-signature`. */
  webhookSecret: string;
  /** Static OAuth redirect URI registered in the application. Must match exactly. */
  redirectUri: string;
  /** 32 bytes, base64 encoded. AES-256-GCM key for tokens at rest. */
  tokenEncryptionKey: string;
  /** Public base URL of the Vendure server. Used for `notification_url` in `preference` mode. */
  publicUrl: string;
  /** Where the store owner lands after the OAuth flow finishes (`?mp=connected|error`). */
  dashboardUrl: string;
  /**
   * `application` (default): notifications arrive at the app-level webhook and the store is found by
   * the seller's `user_id` (PRD 9.7).
   * `preference`: plan B for PRD V1/V2. Each preference carries a `notification_url` with the
   * channel token in the path.
   */
  webhookMode?: WebhookMode;
  /**
   * In `preference` mode, reject notifications without a valid `x-signature`. Set to false only if
   * sandbox shows that notifications sent to `notification_url` are not signed (PRD V2). The
   * payment is always re-queried with the store's token, so this never decides an order state.
   */
  requireSignatureInPreferenceMode?: boolean;
  /** Send `test_token: true` when exchanging OAuth codes (sandbox, PRD 9.2). */
  oauthTestToken?: boolean;
  /** Reject notifications whose `ts` is further than this from now. Default 600. */
  webhookToleranceSeconds?: number;
  /** Preference validity in minutes. Default 30 (PRD 9.6). */
  preferenceTtlMinutes?: number;
  /**
   * `lines` (default): one preference item per order line plus shipping, falling back to a single
   * total line when the sum does not match the order total.
   * `total`: a single item with the order total (PRD V7 plan B).
   */
  preferenceItemsMode?: PreferenceItemsMode;
  /** Renew connections that expire in fewer than this many days. Default 30 (PRD 9.4). */
  refreshWindowDays?: number;
  /** Reject OAuth grants whose scope lacks `offline_access` (PRD 9.3). Default true. */
  requireOfflineAccess?: boolean;
  /** Authorization host. Default `https://auth.mercadopago.com`. */
  authUrl?: string;
}

export type ResolvedMercadoPagoOptions = Required<MercadoPagoPluginOptions>;

export function resolveOptions(options: MercadoPagoPluginOptions): ResolvedMercadoPagoOptions {
  return {
    webhookMode: 'application',
    requireSignatureInPreferenceMode: true,
    oauthTestToken: false,
    webhookToleranceSeconds: 600,
    preferenceTtlMinutes: 30,
    preferenceItemsMode: 'lines',
    refreshWindowDays: 30,
    requireOfflineAccess: true,
    authUrl: 'https://auth.mercadopago.com',
    ...stripUndefined(options),
  };
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
