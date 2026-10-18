import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { print } from 'graphql';
import { ClientError, GraphQLClient } from 'graphql-request';
import { CommerceError, ErrorCodes } from './errors';
import { memorySession, SessionStore } from './session';

export interface CommerceConfig {
  /** URL of the Shop API, e.g. `https://api.example.com/shop-api`. */
  apiUrl: string;
  /**
   * Channel token of the store this frontend serves, sent as `vendure-token` on every call.
   * Never the default channel's (PRD 10.1).
   */
  channelToken: string;
  /** Where the buyer's session token is kept. Defaults to memory, which is per client instance. */
  session?: SessionStore;
  /** Custom `fetch`, for example to add a timeout or tracing. Defaults to the global one. */
  fetch?: typeof fetch;
  /** Extra headers for every request (for example a forwarded client IP). */
  headers?: Record<string, string>;
}

export const AUTH_TOKEN_HEADER = 'vendure-auth-token';
export const CHANNEL_TOKEN_HEADER = 'vendure-token';

/**
 * Sends typed Shop API operations: adds the channel token and the session, stores the session
 * the server hands out, and turns every failure into a `CommerceError`.
 */
export class Transport {
  readonly session: SessionStore;
  private readonly client: GraphQLClient;

  constructor(private readonly config: CommerceConfig) {
    if (!config.apiUrl) throw new CommerceError('CONFIG_ERROR', 'apiUrl is required.');
    if (!config.channelToken) throw new CommerceError('CONFIG_ERROR', 'channelToken is required.');
    this.session = config.session ?? memorySession();
    this.client = new GraphQLClient(config.apiUrl, {
      fetch: config.fetch,
      headers: { ...config.headers, [CHANNEL_TOKEN_HEADER]: config.channelToken },
    });
  }

  async request<TResult, TVariables extends Record<string, unknown>>(
    document: TypedDocumentNode<TResult, TVariables>,
    ...variables: TVariables extends Record<string, never> ? [] : [TVariables]
  ): Promise<TResult> {
    const token = await this.session.get();
    try {
      const response = await this.client.rawRequest<TResult, TVariables>(
        printDocument(document),
        variables[0] as TVariables | undefined,
        token ? { Authorization: `Bearer ${token}` } : undefined,
      );
      const issued = response.headers.get(AUTH_TOKEN_HEADER);
      if (issued && issued !== token) await this.session.set(issued);
      return response.data;
    } catch (error) {
      throw toCommerceError(error);
    }
  }
}

const printed = new WeakMap<object, string>();

function printDocument(document: TypedDocumentNode<unknown, never> | object): string {
  let text = printed.get(document);
  if (!text) {
    text = print(document as Parameters<typeof print>[0]);
    printed.set(document, text);
  }
  return text;
}

function toCommerceError(error: unknown): CommerceError {
  if (error instanceof CommerceError) return error;
  if (error instanceof ClientError) {
    const first = error.response.errors?.[0];
    if (first) {
      return new CommerceError(ErrorCodes.GraphQL, first.message, {
        status: error.response.status,
        path: first.path,
        extensions: first.extensions,
      });
    }
    return new CommerceError(
      ErrorCodes.UnexpectedResponse,
      `The server answered HTTP ${error.response.status}.`,
      { status: error.response.status },
    );
  }
  return new CommerceError(
    ErrorCodes.Network,
    error instanceof Error ? error.message : 'The server could not be reached.',
  );
}
