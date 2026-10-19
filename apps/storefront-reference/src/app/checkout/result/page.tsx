import { Page } from '@/components/ui';
import { PaymentStatus } from '@/components/payment-status';
import { getCommerce } from '@/lib/commerce';
import { getConfig } from '@/lib/config';

export const metadata = { title: 'Resultado del pago' };

/**
 * The reference of the preference as it came back. Only its alphabet and length are checked, to
 * keep junk out of the URL of the status endpoint: its text is never read for an order, a store or
 * anything else (PRD 9.6). The server looks it up whole.
 */
const REFERENCE = /^[A-Za-z0-9_-]{1,120}$/;
const PAYMENT_ID = /^[0-9]{1,20}$/;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Where Mercado Pago sends the buyer back (PRD 9.6 step 4). The URL carries `payment_id`,
 * `external_reference` and `status`, but **none of it confirms a payment**: `payment_id` and
 * `external_reference` only tell the server *which* payment and preference to check. The order this
 * page shows is the one of the buyer's own session, or the one the server answers with: it is never
 * read out of the `external_reference`.
 */
export default async function ResultPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const reference = first(params.external_reference);
  const paymentId = first(params.payment_id) ?? first(params.collection_id);

  // The order of this browser session, if it still has one. The cart is read, not the URL.
  const commerce = await getCommerce();
  const orderCode = (await commerce.cart.getCart())?.code;

  return (
    <Page title="Resultado del pago">
      <PaymentStatus
        orderCode={orderCode}
        externalReference={reference && REFERENCE.test(reference) ? reference : undefined}
        paymentId={paymentId && PAYMENT_ID.test(paymentId) ? paymentId : undefined}
        syncAfterMs={getConfig().syncAfterMs}
      />
    </Page>
  );
}
