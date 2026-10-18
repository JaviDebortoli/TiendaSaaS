import { CommerceError } from '@tiendasaas/commerce-core';
import { NextResponse, type NextRequest } from 'next/server';
import { getCommerce } from '@/lib/commerce';

const ORDER_CODE = /^[A-Za-z0-9]{4,40}$/;
const PAYMENT_ID = /^[0-9]{1,20}$/;

/**
 * One check of a payment, for the result page to poll.
 *
 * It asks the server (Vendure) what happened: the order state, and, when a `paymentId` is given,
 * the server's own check of that payment with the store's credentials. The `paymentId` is only a
 * pointer taken from the redirect; nothing coming from the redirect decides the answer.
 */
export async function GET(request: NextRequest) {
  const orderCode = request.nextUrl.searchParams.get('order') ?? '';
  const paymentId = request.nextUrl.searchParams.get('paymentId') ?? undefined;
  if (!ORDER_CODE.test(orderCode) || (paymentId && !PAYMENT_ID.test(paymentId))) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }

  const commerce = await getCommerce();
  let result;
  try {
    result = await commerce.payment.waitForPayment({
      orderCode,
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
      orderCode: result.orderCode,
      total: result.order?.totalWithTax ?? null,
      currency: result.order?.currencyCode ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
