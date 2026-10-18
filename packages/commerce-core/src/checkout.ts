import type { Transport } from './client';
import { CommerceError, ErrorCodes, unwrap } from './errors';
import { ActiveOrderQuery } from './operations/cart';
import {
  CreateMercadoPagoCheckoutMutation,
  EligiblePaymentMethodsQuery,
  EligibleShippingMethodsQuery,
  OrderByCodeQuery,
  SetBillingAddressMutation,
  SetCustomerMutation,
  SetShippingAddressMutation,
  SetShippingMethodMutation,
  TransitionOrderMutation,
} from './operations/checkout';
import type {
  Address,
  Cart,
  CustomerDetails,
  PaymentMethodQuote,
  ShippingMethodQuote,
} from './types';

export interface ReturnUrls {
  /** Pages of this storefront Mercado Pago sends the buyer back to. They must be https and on the
   * domain configured for the store. */
  successUrl: string;
  failureUrl: string;
  pendingUrl: string;
}

export interface StartPaymentOptions {
  /**
   * The total (cents) the buyer saw on the review screen. If the order no longer adds up to it,
   * `startPayment` throws a `CommerceError` with code `ORDER_CHANGED` and creates nothing.
   */
  expectedTotal?: number;
}

export interface StartedPayment {
  orderCode: string;
  /** Redirect the buyer here to pay on Mercado Pago. */
  redirectUrl: string;
  preferenceId: string;
  expiresAt: string;
}

const toAddressInput = (address: Address) => ({
  fullName: address.fullName,
  company: address.company,
  streetLine1: address.streetLine1,
  streetLine2: address.streetLine2,
  city: address.city,
  province: address.province,
  postalCode: address.postalCode,
  countryCode: address.countryCode,
  phoneNumber: address.phoneNumber,
});

/**
 * The steps between a full cart and the Mercado Pago page (PRD 9.6): who the buyer is, where it
 * goes, how it travels, and the redirect. Guest checkout is the default: nothing here needs an
 * account.
 */
export function createCheckout(transport: Transport) {
  return {
    async setCustomer(customer: CustomerDetails): Promise<Cart> {
      const { setCustomerForOrder } = await transport.request(SetCustomerMutation, {
        input: {
          emailAddress: customer.email.trim(),
          firstName: customer.firstName.trim(),
          lastName: customer.lastName.trim(),
          phoneNumber: customer.phoneNumber,
        },
      });
      return unwrap(setCustomerForOrder) as Cart;
    },

    async setShippingAddress(address: Address): Promise<Cart> {
      const { setOrderShippingAddress } = await transport.request(SetShippingAddressMutation, {
        input: toAddressInput(address),
      });
      return unwrap(setOrderShippingAddress) as Cart;
    },

    async setBillingAddress(address: Address): Promise<Cart> {
      const { setOrderBillingAddress } = await transport.request(SetBillingAddressMutation, {
        input: toAddressInput(address),
      });
      return unwrap(setOrderBillingAddress) as Cart;
    },

    /** Delivery options this order qualifies for (pickup, flat rate), with their price. */
    async getShippingMethods(): Promise<ShippingMethodQuote[]> {
      const { eligibleShippingMethods } = await transport.request(EligibleShippingMethodsQuery);
      return eligibleShippingMethods;
    },

    async selectShippingMethod(shippingMethodId: string): Promise<Cart> {
      const { setOrderShippingMethod } = await transport.request(SetShippingMethodMutation, {
        ids: [shippingMethodId],
      });
      return unwrap(setOrderShippingMethod) as Cart;
    },

    /** Payment methods the store offers right now. Mercado Pago disappears while the store is disconnected. */
    async getPaymentMethods(): Promise<PaymentMethodQuote[]> {
      const { eligiblePaymentMethods } = await transport.request(EligiblePaymentMethodsQuery);
      return eligiblePaymentMethods.filter((method) => method.isEligible);
    },

    /**
     * Moves the order to payment and asks the server for the Mercado Pago page.
     *
     * Vendure checks the delivery method again when the order enters payment (3.8): if it stopped
     * being eligible this throws a `CommerceError` with code `ORDER_STATE_TRANSITION_ERROR` and
     * the server's explanation in `details.transitionError`, so the storefront can send the buyer
     * back to the delivery step.
     */
    async startPayment(
      urls: ReturnUrls,
      options: StartPaymentOptions = {},
    ): Promise<StartedPayment> {
      const { activeOrder } = await transport.request(ActiveOrderQuery);
      if (!activeOrder) {
        throw new CommerceError(ErrorCodes.NoActiveOrder, 'There is no active cart.');
      }
      let current: { totalWithTax: number } = activeOrder;
      if (activeOrder.state !== 'ArrangingPayment') {
        const { transitionOrderToState } = await transport.request(TransitionOrderMutation, {
          state: 'ArrangingPayment',
        });
        current = unwrap(transitionOrderToState) as Cart;
      }
      // Vendure swaps a delivery method that stopped qualifying without raising an error, which
      // changes the total. If the buyer reviewed another total, stop instead of charging this one.
      if (options.expectedTotal !== undefined && current.totalWithTax !== options.expectedTotal) {
        throw new CommerceError('ORDER_CHANGED', 'The order changed after the buyer reviewed it.', {
          expectedTotal: options.expectedTotal,
          currentTotal: current.totalWithTax,
        });
      }
      const { createMercadoPagoCheckout } = await transport.request(
        CreateMercadoPagoCheckoutMutation,
        { input: { orderCode: activeOrder.code, ...urls } },
      );
      const checkout = unwrap(createMercadoPagoCheckout);
      if (checkout.__typename !== 'MercadoPagoCheckout') {
        throw new CommerceError(ErrorCodes.UnexpectedResponse, 'Unexpected checkout result.');
      }
      return {
        orderCode: activeOrder.code,
        redirectUrl: checkout.initPoint,
        preferenceId: checkout.preferenceId,
        expiresAt: checkout.expiresAt,
      };
    },

    /** Goes back to editing the cart (for example to change the delivery step). */
    async backToCart(): Promise<Cart> {
      const { transitionOrderToState } = await transport.request(TransitionOrderMutation, {
        state: 'AddingItems',
      });
      return unwrap(transitionOrderToState) as Cart;
    },

    /** An order by its public code: the confirmation page, or the account order history. */
    async getOrder(code: string): Promise<Cart | null> {
      const { orderByCode } = await transport.request(OrderByCodeQuery, { code });
      return orderByCode ?? null;
    },
  };
}

export type CheckoutApi = ReturnType<typeof createCheckout>;
