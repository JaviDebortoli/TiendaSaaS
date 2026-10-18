export const MP_PLUGIN_OPTIONS = Symbol('MERCADOPAGO_PLUGIN_OPTIONS');
export const loggerCtx = 'MercadoPagoPlugin';

/** Code of the Vendure PaymentMethodHandler. PaymentMethods in every channel use this handler. */
export const MERCADOPAGO_HANDLER_CODE = 'mercado-pago';

export const WEBHOOK_QUEUE_NAME = 'mercadopago-webhook';
export const REFRESH_TASK_ID = 'mercadopago-refresh-connections';

export const OFFLINE_ACCESS_SCOPE = 'offline_access';
export const MERCADOPAGO_API_URL = 'https://api.mercadopago.com';
export const DEFAULT_AUTH_URL = 'https://auth.mercadopago.com';

/** Access tokens last 180 days (documented). Used when a refresh response omits `expires_in`. */
export const DEFAULT_TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60;
