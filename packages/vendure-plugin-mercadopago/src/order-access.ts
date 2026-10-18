import {
  InjectableStrategy,
  Order,
  OrderByCodeAccessStrategy,
  RequestContext,
} from '@vendure/core';

/**
 * Vendure lets a guest read an order by its code only after it was placed. The payment result
 * screen has to read the order while it is still being paid, so this wraps the configured
 * strategy and also lets a session read **its own active order**. Nothing else changes: another
 * session, or another store, still gets whatever the wrapped strategy decides.
 */
export class SessionOrderByCodeAccessStrategy implements OrderByCodeAccessStrategy {
  constructor(private readonly wrapped: OrderByCodeAccessStrategy) {}

  async init(injector: Parameters<NonNullable<InjectableStrategy['init']>>[0]): Promise<void> {
    await this.wrapped.init?.(injector);
  }

  async destroy(): Promise<void> {
    await this.wrapped.destroy?.();
  }

  canAccessOrder(ctx: RequestContext, order: Order): boolean | Promise<boolean> {
    const activeOrderId = ctx.session?.activeOrderId;
    if (activeOrderId !== undefined && String(activeOrderId) === String(order.id)) return true;
    return this.wrapped.canAccessOrder(ctx, order);
  }
}
