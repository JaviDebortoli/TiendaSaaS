import type { Transport } from './client';
import { unwrap } from './errors';
import {
  ActiveCustomerQuery,
  CustomerOrdersQuery,
  LoginMutation,
  LogoutMutation,
  RegisterMutation,
  RequestPasswordResetMutation,
  ResetPasswordMutation,
  VerifyEmailMutation,
} from './operations/account';
import type { Customer, ListOptions, OrderSummary } from './types';

export interface Registration {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
}

/**
 * The optional account (PRD 6.2): the same account works in every store of the platform, so a
 * storefront should present it as the platform's account, not as this store's.
 * Buying never requires one.
 */
export function createAccount(transport: Transport) {
  return {
    /** Registers an account. The platform sends a verification email before the first login. */
    async register(registration: Registration): Promise<void> {
      const { registerCustomerAccount } = await transport.request(RegisterMutation, {
        input: {
          emailAddress: registration.email.trim(),
          password: registration.password,
          firstName: registration.firstName.trim(),
          lastName: registration.lastName.trim(),
          phoneNumber: registration.phoneNumber,
        },
      });
      unwrap(registerCustomerAccount);
    },

    async verifyEmail(token: string, password?: string): Promise<void> {
      const { verifyCustomerAccount } = await transport.request(VerifyEmailMutation, {
        token,
        password,
      });
      unwrap(verifyCustomerAccount);
    },

    /** Signs in. The cart of the current session is kept. */
    async login(email: string, password: string, rememberMe = true): Promise<void> {
      const { login } = await transport.request(LoginMutation, {
        email: email.trim(),
        password,
        rememberMe,
      });
      unwrap(login);
    },

    async logout(): Promise<void> {
      await transport.request(LogoutMutation);
      await transport.session.set(undefined);
    },

    /** The signed-in customer, or `null` for a guest. */
    async getCustomer(): Promise<Customer | null> {
      const { activeCustomer } = await transport.request(ActiveCustomerQuery);
      return activeCustomer ?? null;
    },

    /** Orders this customer placed in this store (orders belong to one store, PRD 6.2). */
    async listOrders(
      options: ListOptions = {},
    ): Promise<{ totalItems: number; items: OrderSummary[] }> {
      const { activeCustomer } = await transport.request(CustomerOrdersQuery, {
        options: {
          skip: options.skip ?? 0,
          take: Math.min(100, options.take ?? 20),
          sort: { orderPlacedAt: 'DESC' },
          filter: { active: { eq: false } },
        },
      });
      return activeCustomer?.orders ?? { totalItems: 0, items: [] };
    },

    async requestPasswordReset(email: string): Promise<void> {
      const { requestPasswordReset } = await transport.request(RequestPasswordResetMutation, {
        email: email.trim(),
      });
      unwrap(requestPasswordReset);
    },

    async resetPassword(token: string, password: string): Promise<void> {
      const { resetPassword } = await transport.request(ResetPasswordMutation, { token, password });
      unwrap(resetPassword);
    },
  };
}

export type AccountApi = ReturnType<typeof createAccount>;
