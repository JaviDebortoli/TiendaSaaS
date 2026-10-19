import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const API = 'https://api.mercadopago.com';

export interface RecordedRequest {
  method: string;
  path: string;
  authorization: string | null;
  idempotencyKey: string | null;
  body: Record<string, unknown> | undefined;
}

export interface OAuthGrant {
  access_token: string;
  refresh_token: string;
  user_id: number;
  expires_in?: number;
  scope?: string;
  public_key?: string;
}

export interface MockPayment {
  id: number;
  status: string;
  status_detail?: string;
  transaction_amount: number;
  currency_id: string;
  external_reference: string;
  /** Access token of the seller who owns the payment. Other tokens get a 404, like the real API. */
  ownerToken: string;
  /**
   * `collector_id` the API reports: the seller account that collected the payment. Omitted from the
   * response when undefined or null, like a payment that does not say who collected it.
   */
  collector_id?: number | null;
  /** Any token can read this payment (what a forged `external_reference` would rely on). */
  anyoneCanRead?: boolean;
  /**
   * The preference this payment came from. The payment's merchant order answers it as
   * `preference_id`; undefined or null means the order does not say.
   */
  preferenceId?: string | null;
  /**
   * The merchant order the payment reports. Defaults to one derived from the payment id whenever
   * `preferenceId` is given; null leaves the payment without an order (a payment that does not say
   * which order it belongs to).
   */
  order?: { id: number; type: string } | null;
  transaction_amount_refunded?: number;
}

function parseBody(raw: string): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** In-process stand-in for the parts of the Mercado Pago API the plugin talks to. */
export class MercadoPagoMock {
  readonly server = setupServer();
  requests: RecordedRequest[] = [];
  /** authorization `code` -> token response. Unknown codes answer `invalid_grant`. */
  grants = new Map<string, OAuthGrant>();
  /** refresh token -> token response. Unknown refresh tokens answer `invalid_grant`. */
  refreshGrants = new Map<string, OAuthGrant>();
  /** Access tokens `/users/me` accepts. */
  validTokens = new Set<string>();
  /**
   * Access tokens every API call refuses, by the status it answers: 401 is a revoked or replaced
   * token, 403 a token that is valid but may not do that. The token endpoint is not affected.
   */
  rejectedTokens = new Map<string, number>();
  /**
   * When set, `/users/me` answers this status whatever the token is: 200 for a check that finds the
   * account fine while other calls are refused, 503 for one that cannot tell.
   */
  meStatus: number | undefined = undefined;
  /** When set, the token endpoint answers this status (a wrong client secret, say) whatever it is asked. */
  oauthStatus: number | undefined = undefined;
  /** When set, a refresh token works once, like Mercado Pago's: using it again is `invalid_grant`. */
  singleUseRefreshTokens = false;
  /** Artificial latency of the token endpoint, to make two renewals overlap. */
  oauthDelayMs = 0;
  /**
   * When set, the token endpoint receives the request, records it and then waits for this promise
   * before answering: a test holds a renewal in flight and decides when it ends, with no timers.
   */
  oauthGate: Promise<void> | undefined = undefined;
  payments = new Map<number, MockPayment>();
  /** merchant order id -> the payment it belongs to. */
  merchantOrders = new Map<number, MockPayment>();
  /** Status the merchant order endpoint answers with; 200 by default, 503 simulates an outage. */
  merchantOrderStatus = 200;
  /** When set, refunds are rejected with this message (e.g. the seller has no balance). */
  refundError: string | undefined;
  /** Artificial latency of GET /v1/payments/:id, to prove webhooks are answered before processing. */
  paymentLookupDelayMs = 0;
  /** Status the preference endpoint answers with; set to 500 to simulate an outage. */
  preferenceStatus = 201;
  /** Preferences created so far, by id (the e2e checkout page needs the body to build the redirect). */
  preferences = new Map<string, Record<string, unknown>>();
  /** Base of the `init_point` the preference answers with. */
  initPointBase = 'https://mp.test/checkout';
  private counter = 0;

  constructor() {
    this.server.use(
      http.get(`${API}/users/me`, async ({ request }) => {
        if (this.meStatus === undefined) return undefined;
        await this.record(request);
        return this.meStatus === 200
          ? HttpResponse.json({ id: 1 })
          : HttpResponse.json(
              { message: 'down', status: this.meStatus },
              { status: this.meStatus },
            );
      }),
      // A token that is refused gets its status from every endpoint but the token one, which has
      // no bearer. Answering nothing here lets the request fall through to the handlers below.
      http.all(`${API}/*`, async ({ request }) => {
        const token = request.headers.get('authorization')?.replace('Bearer ', '');
        const status = token ? this.rejectedTokens.get(token) : undefined;
        if (status === undefined) return undefined;
        await this.record(request);
        return HttpResponse.json({ message: 'invalid_token', status }, { status });
      }),
      http.post(`${API}/oauth/token`, async ({ request }) => {
        const body = await this.record(request);
        if (this.oauthDelayMs) await new Promise((r) => setTimeout(r, this.oauthDelayMs));
        if (this.oauthGate) await this.oauthGate;
        if (this.oauthStatus !== undefined) {
          return HttpResponse.json(
            { error: 'invalid_client', message: 'Invalid client', status: this.oauthStatus },
            { status: this.oauthStatus },
          );
        }
        const grant =
          body?.grant_type === 'refresh_token'
            ? this.refreshGrants.get(String(body.refresh_token))
            : this.grants.get(String(body?.code));
        if (grant && body?.grant_type === 'refresh_token' && this.singleUseRefreshTokens) {
          this.refreshGrants.delete(String(body.refresh_token));
        }
        if (!grant) {
          return HttpResponse.json(
            { error: 'invalid_grant', message: 'Error validating grant', status: 400 },
            { status: 400 },
          );
        }
        this.validTokens.add(grant.access_token);
        return HttpResponse.json({ token_type: 'Bearer', live_mode: false, ...grant });
      }),
      http.get(`${API}/users/me`, async ({ request }) => {
        await this.record(request);
        const token = request.headers.get('authorization')?.replace('Bearer ', '');
        return token && this.validTokens.has(token)
          ? HttpResponse.json({ id: 1 })
          : HttpResponse.json({ message: 'invalid_token', status: 401 }, { status: 401 });
      }),
      http.post(`${API}/checkout/preferences`, async ({ request }) => {
        const preferenceBody = await this.record(request);
        if (this.preferenceStatus !== 201) {
          return HttpResponse.json(
            { message: 'down', status: this.preferenceStatus },
            { status: this.preferenceStatus },
          );
        }
        const id = `pref-${++this.counter}`;
        this.preferences.set(id, preferenceBody ?? {});
        return HttpResponse.json(
          {
            id,
            init_point: `${this.initPointBase}/${id}`,
            sandbox_init_point: `https://sandbox.mp.test/checkout/${id}`,
          },
          { status: 201 },
        );
      }),
      http.get(`${API}/v1/payments/:id`, async ({ request, params }) => {
        await this.record(request);
        if (this.paymentLookupDelayMs)
          await new Promise((r) => setTimeout(r, this.paymentLookupDelayMs));
        const payment = this.payments.get(Number(params.id));
        const token = request.headers.get('authorization')?.replace('Bearer ', '');
        if (!payment || (payment.ownerToken !== token && !payment.anyoneCanRead)) {
          return HttpResponse.json({ message: 'Payment not found', status: 404 }, { status: 404 });
        }
        return HttpResponse.json(this.publicFields(payment));
      }),
      http.get(`${API}/merchant_orders/:id`, async ({ request, params }) => {
        await this.record(request);
        if (this.merchantOrderStatus !== 200) {
          return HttpResponse.json(
            { message: 'down', status: this.merchantOrderStatus },
            { status: this.merchantOrderStatus },
          );
        }
        const payment = this.merchantOrders.get(Number(params.id));
        const token = request.headers.get('authorization')?.replace('Bearer ', '');
        if (!payment || (payment.ownerToken !== token && !payment.anyoneCanRead)) {
          return HttpResponse.json(
            { message: 'Merchant order not found', status: 404 },
            { status: 404 },
          );
        }
        return HttpResponse.json({
          id: Number(params.id),
          status: 'opened',
          ...(payment.preferenceId ? { preference_id: payment.preferenceId } : {}),
          payments: [{ id: payment.id, status: payment.status }],
        });
      }),
      http.put(`${API}/v1/payments/:id`, async ({ request, params }) => {
        const body = await this.record(request);
        const payment = this.payments.get(Number(params.id));
        if (!payment) return HttpResponse.json({ message: 'Payment not found' }, { status: 404 });
        if (body?.status === 'cancelled') payment.status = 'cancelled';
        return HttpResponse.json(this.publicFields(payment));
      }),
      http.post(`${API}/v1/payments/:id/refunds`, async ({ request, params }) => {
        const body = await this.record(request);
        const payment = this.payments.get(Number(params.id));
        if (!payment) return HttpResponse.json({ message: 'Payment not found' }, { status: 404 });
        if (this.refundError) {
          return HttpResponse.json(
            { message: this.refundError, error: 'bad_request', status: 400 },
            { status: 400 },
          );
        }
        const amount = typeof body?.amount === 'number' ? body.amount : payment.transaction_amount;
        payment.transaction_amount_refunded = (payment.transaction_amount_refunded ?? 0) + amount;
        return HttpResponse.json(
          { id: 9000 + ++this.counter, payment_id: payment.id, amount },
          { status: 201 },
        );
      }),
      // Anything else aimed at Mercado Pago fails loudly: tests must never reach the real API.
      http.all(`${API}/*`, async ({ request }) => {
        await this.record(request);
        return HttpResponse.json({ message: 'Unmocked Mercado Pago endpoint' }, { status: 501 });
      }),
    );
  }

  start(): void {
    // Requests to the local Vendure test server must reach it untouched.
    this.server.listen({ onUnhandledFrame: 'bypass' });
  }

  stop(): void {
    this.server.close();
  }

  reset(): void {
    this.requests = [];
    this.grants.clear();
    this.refreshGrants.clear();
    this.validTokens.clear();
    this.rejectedTokens.clear();
    this.meStatus = undefined;
    this.oauthStatus = undefined;
    this.singleUseRefreshTokens = false;
    this.oauthDelayMs = 0;
    this.oauthGate = undefined;
    this.payments.clear();
    this.merchantOrders.clear();
    this.merchantOrderStatus = 200;
    this.refundError = undefined;
    this.paymentLookupDelayMs = 0;
    this.preferenceStatus = 201;
  }

  requestsTo(method: string, path: string): RecordedRequest[] {
    return this.requests.filter((r) => r.method === method && r.path === path);
  }

  addPayment(payment: MockPayment): MockPayment {
    if (payment.preferenceId && payment.order === undefined) {
      payment.order = { id: 1_000_000 + payment.id, type: 'mercadopago' };
    }
    this.payments.set(payment.id, payment);
    if (payment.order) this.merchantOrders.set(payment.order.id, payment);
    return payment;
  }

  private publicFields(payment: MockPayment): Record<string, unknown> {
    const {
      ownerToken: _owner,
      anyoneCanRead: _any,
      preferenceId: _preference,
      order,
      collector_id,
      ...fields
    } = payment;
    return {
      ...fields,
      ...(collector_id === undefined || collector_id === null ? {} : { collector_id }),
      ...(order ? { order } : {}),
    };
  }

  private async record(request: Request): Promise<Record<string, unknown> | undefined> {
    const body = parseBody(await request.clone().text());
    this.requests.push({
      method: request.method,
      // The SDK adds a trailing slash to some endpoints (/checkout/preferences/).
      path: new URL(request.url).pathname.replace(/\/+$/, '') || '/',
      authorization: request.headers.get('authorization'),
      idempotencyKey: request.headers.get('x-idempotency-key'),
      body,
    });
    return body;
  }
}
