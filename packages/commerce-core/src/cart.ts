import type { Transport } from './client';
import {
  ActiveOrderQuery,
  AddItemMutation,
  AdjustLineMutation,
  ApplyCouponMutation,
  RemoveCouponMutation,
  RemoveLineMutation,
} from './operations/cart';
import { unwrap } from './errors';
import type { Cart } from './types';

/**
 * Every function returns the whole updated cart, so a storefront re-renders from one value.
 * Errors the shop reports (no stock, quantity limits, bad coupon) are thrown as `CommerceError`.
 */
export function createCart(transport: Transport) {
  const removeFromCart = async (lineId: string): Promise<Cart> => {
    const { removeOrderLine } = await transport.request(RemoveLineMutation, { lineId });
    return unwrap(removeOrderLine) as Cart;
  };

  return {
    /** The active cart, or `null` while the buyer has not added anything. */
    async getCart(): Promise<Cart | null> {
      const { activeOrder } = await transport.request(ActiveOrderQuery);
      return activeOrder ?? null;
    },

    async addToCart(variantId: string, quantity = 1): Promise<Cart> {
      const { addItemToOrder } = await transport.request(AddItemMutation, { variantId, quantity });
      return unwrap(addItemToOrder) as Cart;
    },

    /** Sets a line's quantity. Zero (or less) removes the line. */
    async setLineQuantity(lineId: string, quantity: number): Promise<Cart> {
      if (quantity <= 0) return removeFromCart(lineId);
      const { adjustOrderLine } = await transport.request(AdjustLineMutation, { lineId, quantity });
      return unwrap(adjustOrderLine) as Cart;
    },

    removeFromCart,

    async applyCoupon(code: string): Promise<Cart> {
      const { applyCouponCode } = await transport.request(ApplyCouponMutation, {
        code: code.trim(),
      });
      return unwrap(applyCouponCode) as Cart;
    },

    async removeCoupon(code: string): Promise<Cart> {
      const { removeCouponCode } = await transport.request(RemoveCouponMutation, { code });
      return removeCouponCode as Cart;
    },
  };
}

export type CartApi = ReturnType<typeof createCart>;
