'use client';

import type { PaymentState } from '@tiendasaas/commerce-core';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

// Formatting is done here so the browser bundle does not need the whole commerce package.
const formatMoney = (cents: number, currency: string) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency }).format(cents / 100);

interface Status {
  state: PaymentState;
  /** The order of the answer: the session's own, or the one the server resolved. */
  orderCode?: string | null;
  total: number | null;
  currency: string | null;
}

const POLL_MS = 1500;
/** After this long the page stops asking and tells the buyer to come back later. */
const GIVE_UP_MS = 120_000;

/**
 * Result of the payment. It shows "procesando" until the server says otherwise: the parameters in
 * the URL (`status=approved`, ...) are never read here.
 */
export function PaymentStatus({
  orderCode,
  externalReference,
  paymentId,
  syncAfterMs,
}: {
  /** The order of this session, if it has one. */
  orderCode?: string;
  /** The `external_reference` of the redirect, passed on untouched. */
  externalReference?: string;
  paymentId?: string;
  syncAfterMs: number;
}) {
  const [status, setStatus] = useState<Status>({
    state: 'processing',
    orderCode,
    total: null,
    currency: null,
  });
  const [gaveUp, setGaveUp] = useState(false);
  const started = useRef(Date.now());

  useEffect(() => {
    // Nothing identifies an order or a payment (the redirect carried nothing and the session has no
    // order): there is nothing to ask. The page says "procesando" and the webhook settles the order.
    if (!orderCode && !(externalReference && paymentId)) {
      setGaveUp(true);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      const elapsed = Date.now() - started.current;
      // The webhook normally settles the order first. Only if it is late do we ask the server to
      // check the payment itself.
      const useSync =
        paymentId !== undefined && externalReference !== undefined && elapsed >= syncAfterMs;
      const query = new URLSearchParams();
      if (orderCode) query.set('order', orderCode);
      if (useSync) {
        query.set('externalReference', externalReference);
        query.set('paymentId', paymentId);
      }
      try {
        const response = await fetch(`/api/payment-status?${query}`, { cache: 'no-store' });
        if (response.ok && !cancelled) {
          const next = (await response.json()) as Status;
          setStatus(next);
          if (next.state !== 'processing') return; // final answer
        }
      } catch {
        // A network blip: keep trying.
      }
      if (cancelled) return;
      if (elapsed >= GIVE_UP_MS) {
        setGaveUp(true);
        return;
      }
      timer = setTimeout(poll, POLL_MS);
    };
    void poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderCode, externalReference, paymentId, syncAfterMs]);

  const total =
    status.total !== null ? formatMoney(status.total, status.currency ?? 'ARS') : undefined;

  switch (status.state) {
    case 'paid':
      return (
        <Message title="¡Pago confirmado!" tone="ok">
          <p>
            Recibimos tu pago{total ? ` de ${total}` : ''}. Tu pedido es el{' '}
            <strong data-testid="order-code">{status.orderCode}</strong>.
          </p>
          <p className="mt-2">Te enviamos el comprobante por email.</p>
          <Link href="/" className="mt-4 inline-block underline">
            Seguir comprando
          </Link>
        </Message>
      );
    case 'pending':
      return (
        <Message title="Pago pendiente" tone="wait">
          <p>
            Todavía no recibimos el pago. Si elegiste pagar en efectivo, tenés que completarlo en el
            punto de pago. Cuando se acredite, confirmamos tu pedido{' '}
            <strong>{status.orderCode}</strong>.
          </p>
        </Message>
      );
    case 'failed':
      return (
        <Message title="No se pudo completar el pago" tone="error">
          <p>El pago fue rechazado o cancelado. No se te cobró nada por este intento.</p>
          <Link href="/checkout/pay" className="mt-4 inline-block underline">
            Intentar de nuevo
          </Link>
        </Message>
      );
    case 'review':
      return (
        <Message title="Estamos revisando tu pago" tone="wait">
          <p>
            Recibimos el pago, pero el local tiene que revisarlo antes de confirmar el pedido{' '}
            <strong>{status.orderCode}</strong>. Te vamos a avisar por email.
          </p>
        </Message>
      );
    default:
      return (
        <Message title="Procesando tu pago…" tone="wait">
          {gaveUp ? (
            <p>
              Seguimos esperando la confirmación de Mercado Pago. No hace falta que pagues de nuevo:
              si el pago se aprueba, te enviamos el comprobante por email (pedido{' '}
              <strong>{status.orderCode}</strong>).
            </p>
          ) : (
            <p>Estamos confirmando tu pago con Mercado Pago. Esto puede tardar unos segundos.</p>
          )}
        </Message>
      );
  }
}

function Message({
  title,
  tone,
  children,
}: {
  title: string;
  tone: 'ok' | 'wait' | 'error';
  children: React.ReactNode;
}) {
  const colors = {
    ok: 'border-green-300 bg-green-50',
    wait: 'border-neutral-300 bg-neutral-50',
    error: 'border-red-300 bg-red-50',
  }[tone];
  return (
    <div role="status" aria-live="polite" className={`max-w-xl rounded border p-5 ${colors}`}>
      <h2 className="mb-2 text-lg font-semibold" data-testid="payment-title">
        {title}
      </h2>
      <div className="text-sm">{children}</div>
    </div>
  );
}
