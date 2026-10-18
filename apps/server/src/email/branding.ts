import { Injector, RequestContext, SellerService } from '@vendure/core';

export interface PlatformBranding {
  /** How the shared account and the platform are called in emails. */
  name: string;
  /** Sender such as `Platform <no-reply@example.com>`. Stores reuse its address, not its name. */
  from: string;
  /** Public URL of the server (dashboard links). */
  publicUrl: string;
}

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; value: StoreBranding }>();

export interface StoreBranding {
  storeName: string;
  storeLogoUrl: string | null;
  storeContactEmail: string | null;
  storefrontUrl: string | null;
}

/** The address inside `Name <address>`, or the whole string if it has no angle brackets. */
export function addressOf(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1]?.trim() ?? from.trim();
}

/** `"Display name" <address>`, with the name made safe for a header. */
export function formatSender(name: string, address: string): string {
  const safe = name.replace(/["\\\r\n<>]/g, '').trim() || 'Tienda';
  return `"${safe}" <${address}>`;
}

async function loadStore(ctx: RequestContext, injector: Injector): Promise<StoreBranding> {
  const key = String(ctx.channelId);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const sellerId = ctx.channel.sellerId;
  const seller = sellerId ? await injector.get(SellerService).findOne(ctx, sellerId) : undefined;
  const value: StoreBranding = {
    storeName: seller?.name ?? ctx.channel.code,
    storeLogoUrl: seller?.customFields?.logoUrl ?? null,
    storeContactEmail: seller?.customFields?.contactEmail ?? null,
    storefrontUrl: ctx.channel.customFields?.mpStorefrontUrl ?? null,
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Forget cached store details (tests, and stores that were just edited). */
export function clearBrandingCache(): void {
  cache.clear();
}

/**
 * Template variables for every email, by channel (PRD 6.3, V9):
 *
 * - `fromAddress` carries the store's name, for emails about orders.
 * - `platformFromAddress` carries the platform's name, for account emails (verification,
 *   password reset), because the account is shared by all stores.
 * - the links of account emails point to the storefront of the channel the buyer came from.
 */
export function createGlobalTemplateVars(platform: PlatformBranding) {
  const address = addressOf(platform.from);
  return async (ctx: RequestContext, injector: Injector) => {
    const store = await loadStore(ctx, injector);
    const base = store.storefrontUrl?.replace(/\/$/, '') ?? platform.publicUrl;
    return {
      ...store,
      platformName: platform.name,
      fromAddress: formatSender(store.storeName, address),
      platformFromAddress: formatSender(platform.name, address),
      verifyEmailAddressUrl: `${base}/account/verify`,
      passwordResetUrl: `${base}/account/reset-password`,
      changeEmailAddressUrl: `${base}/account`,
      adminDashboardUrl: `${platform.publicUrl}/dashboard`,
      adminPasswordResetUrl: `${platform.publicUrl}/dashboard/reset-password`,
    };
  };
}
