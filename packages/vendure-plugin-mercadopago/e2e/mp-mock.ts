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
  payments = new Map<number, MockPayment>();
  /** When set, refunds are rejected with this message (e.g. the seller has no balance). */
  refundError: string | undefined;
  private counter = 0;

  constructor() {
    this.server.use(
      http.post(`${API}/oauth/token`, async ({ request }) => {
        const body = await this.record(request);
        const grant =
          body?.grant_type === 'refresh_token'
            ? this.refreshGrants.get(String(body.refresh_token))
            : this.grants.get(String(body?.code));
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
        await this.record(request);
        const id = `pref-${++this.counter}`;
        return HttpResponse.json(
          {
            id,
            init_point: `https://mp.test/checkout/${id}`,
            sandbox_init_point: `https://sandbox.mp.test/checkout/${id}`,
          },
          { status: 201 },
        );
      }),
      http.get(`${API}/v1/payments/:id`, async ({ request, params }) => {
        await this.record(request);
        const payment = this.payments.get(Number(params.id));
        const token = request.headers.get('authorization')?.replace('Bearer ', '');
        if (!payment || payment.ownerToken !== token) {
          return HttpResponse.json({ message: 'Payment not found', status: 404 }, { status: 404 });
        }
        const { ownerToken: _owner, ...publicFields } = payment;
        return HttpResponse.json(publicFields);
      }),
      http.put(`${API}/v1/payments/:id`, async ({ request, params }) => {
        const body = await this.record(request);
        const payment = this.payments.get(Number(params.id));
        if (!payment) return HttpResponse.json({ message: 'Payment not found' }, { status: 404 });
        if (body?.status === 'cancelled') payment.status = 'cancelled';
        const { ownerToken: _owner, ...publicFields } = payment;
        return HttpResponse.json(publicFields);
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
    this.payments.clear();
    this.refundError = undefined;
  }

  requestsTo(method: string, path: string): RecordedRequest[] {
    return this.requests.filter((r) => r.method === method && r.path === path);
  }

  addPayment(payment: MockPayment): MockPayment {
    this.payments.set(payment.id, payment);
    return payment;
  }

  private async record(request: Request): Promise<Record<string, unknown> | undefined> {
    const body = parseBody(await request.clone().text());
    this.requests.push({
      method: request.method,
      path: new URL(request.url).pathname,
      authorization: request.headers.get('authorization'),
      idempotencyKey: request.headers.get('x-idempotency-key'),
      body,
    });
    return body;
  }
}
