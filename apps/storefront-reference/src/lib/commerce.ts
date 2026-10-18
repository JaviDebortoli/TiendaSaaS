import 'server-only';
import { createCommerce, type Commerce, type SessionStore } from '@tiendasaas/commerce-core';
import { cookies } from 'next/headers';
import { getConfig } from './config';

const SESSION_COOKIE = 'store_session';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * The buyer's Shop API session lives in an httpOnly cookie of this storefront, so the browser
 * never sees it and the storefront server is the only one that talks to Vendure.
 */
function cookieSession(): SessionStore {
  return {
    async get() {
      return (await cookies()).get(SESSION_COOKIE)?.value;
    },
    async set(token) {
      try {
        const jar = await cookies();
        if (token) {
          jar.set(SESSION_COOKIE, token, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production' && !process.env.INSECURE_COOKIES,
            path: '/',
            maxAge: THIRTY_DAYS,
          });
        } else {
          jar.delete(SESSION_COOKIE);
        }
      } catch {
        // Cookies can only be written from Server Actions and Route Handlers. While rendering a
        // page the session is read-only; it is stored by the next mutation.
      }
    },
  };
}

let defaultChannelChecked = false;

/**
 * "No frontend uses the default channel" (PRD 5.2, 10.1): a wrong token must fail loudly instead
 * of showing every store's catalogue.
 */
async function assertNotDefaultChannel(apiUrl: string, channelToken: string): Promise<void> {
  if (defaultChannelChecked) return;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'vendure-token': channelToken },
    body: JSON.stringify({ query: '{ activeChannel { code } }' }),
    cache: 'no-store',
  });
  const body = (await response.json()) as { data?: { activeChannel?: { code?: string } } };
  const code = body.data?.activeChannel?.code;
  if (!code || code === '__default_channel__') {
    throw new Error(
      'VENDURE_CHANNEL_TOKEN must be the token of a store channel, never of the default channel.',
    );
  }
  defaultChannelChecked = true;
}

export async function getCommerce(): Promise<Commerce> {
  const { apiUrl, channelToken } = getConfig();
  await assertNotDefaultChannel(apiUrl, channelToken);
  return createCommerce({ apiUrl, channelToken, session: cookieSession() });
}
