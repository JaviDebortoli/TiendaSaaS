import { CommerceError } from '@tiendasaas/commerce-core';
import { NextResponse, type NextRequest } from 'next/server';
import { getCommerce } from '@/lib/commerce';

const ORDER_CODE = /^[A-Za-z0-9]{4,40}$/;
const PAYMENT_ID = /^[0-9]{1,20}$/;
/** Same as the result page: alphabet and length only, never read for meaning. */
const REFERENCE = /^[A-Za-z0-9_-]{1,120}$/;

/**
 * One check of a payment, for the result page to poll.
 *
 * It asks the server (Vendure) what happened: the order state of the session's own order, and, when
 * a `paymentId` and the `externalReference` of its preference are given, the server's own check of
 * that payment with the credentials of the account that issued the preference. Both are only
 * pointers taken from the redirect, passed on untouched; nothing coming from the redirect decides
 * the answer, and the order is never read out of the reference.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const orderCode = params.get('order') ?? undefined;
  const externalReference = params.get('externalReference') ?? undefined;
  const paymentId = params.get('paymentId') ?? undefined;
  const valid =
    (orderCode === undefined || ORDER_CODE.test(orderCode)) &&
    (externalReference === undefined || REFERENCE.test(externalReference)) &&
    (paymentId === undefined || PAYMENT_ID.test(paymentId)) &&
    // The server needs something to ask about: an order of the session, or a payment to check.
    (orderCode !== undefined || (externalReference !== undefined && paymentId !== undefined));
  if (!valid) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }

  const commerce = await getCommerce();
  let result;
  try {
    result = await commerce.payment.waitForPayment({
      orderCode,
      externalReference,
      paymentId,
      timeoutMs: 0,
      syncAfterMs: 0,
    });
  } catch (error) {
    if (!(error instanceof CommerceError)) throw error;
    // The server could not answer right now; the page keeps asking.
    return NextResponse.json({ error: error.code }, { status: 502 });
  }

  return NextResponse.json(
    {
      state: result.state,
      orderCode: result.orderCode ?? null,
      total: result.order?.totalWithTax ?? null,
      currency: result.order?.currencyCode ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
