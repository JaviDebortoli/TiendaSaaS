import 'server-only';
import { CommerceError } from '@tiendasaas/commerce-core';
import { redirect } from 'next/navigation';

/** Text for the buyer. Unknown failures get a generic line and are logged on the server. */
export function messageFor(error: unknown): string {
  if (error instanceof CommerceError) {
    switch (error.code) {
      case 'INSUFFICIENT_STOCK_ERROR':
        return 'No hay stock suficiente de ese producto.';
      case 'ORDER_LIMIT_ERROR':
        return 'Superaste la cantidad máxima permitida para ese producto.';
      case 'COUPON_CODE_INVALID_ERROR':
      case 'COUPON_CODE_EXPIRED_ERROR':
      case 'COUPON_CODE_LIMIT_ERROR':
        return 'El cupón no es válido.';
      case 'EMAIL_ADDRESS_CONFLICT_ERROR':
        return 'Ese email ya tiene una cuenta. Iniciá sesión para comprar con ella.';
      case 'INVALID_CREDENTIALS_ERROR':
        return 'Email o contraseña incorrectos.';
      case 'NOT_VERIFIED_ERROR':
        return 'Primero verificá tu email con el enlace que te enviamos.';
      case 'NOT_CONNECTED':
        return 'Esta tienda no puede cobrar en este momento. Probá más tarde.';
      case 'ORDER_STATE_TRANSITION_ERROR':
        return 'La forma de entrega elegida ya no está disponible. Elegí otra.';
      case 'NO_ACTIVE_ORDER':
        return 'Tu carrito está vacío.';
      case 'NETWORK_ERROR':
      case 'GRAPHQL_ERROR':
      case 'UNEXPECTED_RESPONSE':
        console.error('[storefront]', error.code, error.message);
        return 'No pudimos completar la operación. Probá de nuevo en un momento.';
      default:
        return error.message;
    }
  }
  console.error('[storefront] unexpected error', error);
  return 'Ocurrió un error inesperado. Probá de nuevo.';
}

/**
 * Server Actions end with a redirect. `redirect()` works by throwing, so it must never be inside
 * a `try`: run the work first, then redirect with the outcome.
 */
export async function attempt<T>(
  work: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    return { ok: false, message: messageFor(error) };
  }
}

export function redirectWithError(path: string, message: string): never {
  const separator = path.includes('?') ? '&' : '?';
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
}

export function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}
