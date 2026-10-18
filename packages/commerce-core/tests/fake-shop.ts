import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const API_URL = 'https://api.example.test/shop-api';
export const CHANNEL_TOKEN = 'store-token-1';

export interface RecordedCall {
  operation: string;
  variables: Record<string, unknown> | undefined;
  headers: Headers;
}

type Handler = (variables: Record<string, unknown> | undefined) => unknown;

/** A stand-in for the Shop API: answers each operation by name and records every call. */
export class FakeShop {
  readonly server = setupServer();
  calls: RecordedCall[] = [];
  /** Session token the server hands out in `vendure-auth-token`, if any. */
  issueToken: string | undefined;
  private handlers = new Map<string, Handler>();

  constructor() {
    this.server.use(
      http.post(API_URL, async ({ request }) => {
        const body = (await request.json()) as {
          query: string;
          variables?: Record<string, unknown>;
        };
        const operation = /(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1] ?? 'anonymous';
        this.calls.push({ operation, variables: body.variables, headers: request.headers });
        const handler = this.handlers.get(operation);
        if (!handler) {
          return HttpResponse.json(
            { errors: [{ message: `No fake handler for ${operation}` }] },
            { status: 200 },
          );
        }
        const result = handler(body.variables);
        if (result instanceof Response) return result;
        const headers: Record<string, string> = this.issueToken
          ? { 'vendure-auth-token': this.issueToken }
          : {};
        if (result && typeof result === 'object' && '__graphqlError' in result) {
          return HttpResponse.json(
            {
              errors: [{ message: String((result as { __graphqlError: string }).__graphqlError) }],
            },
            { headers },
          );
        }
        return HttpResponse.json({ data: result }, { headers });
      }),
    );
  }

  on(operation: string, handler: Handler | unknown): this {
    this.handlers.set(
      operation,
      typeof handler === 'function' ? (handler as Handler) : () => handler,
    );
    return this;
  }

  start(): void {
    this.server.listen({ onUnhandledFrame: 'error' });
  }

  stop(): void {
    this.server.close();
  }

  reset(): void {
    this.calls = [];
    this.handlers.clear();
    this.issueToken = undefined;
  }

  called(operation: string): RecordedCall[] {
    return this.calls.filter((c) => c.operation === operation);
  }
}

/** A minimal order, enough for the functions under test. */
export function order(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'Order',
    id: '1',
    code: 'ORDER1',
    state: 'AddingItems',
    active: true,
    currencyCode: 'ARS',
    totalQuantity: 1,
    subTotalWithTax: 100000,
    shippingWithTax: 0,
    totalWithTax: 100000,
    couponCodes: [],
    discounts: [],
    customer: null,
    shippingAddress: null,
    shippingLines: [],
    lines: [],
    payments: [],
    ...overrides,
  };
}
