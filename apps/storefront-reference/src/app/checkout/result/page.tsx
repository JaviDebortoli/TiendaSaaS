import { Page } from '@/components/ui';
import { PaymentStatus } from '@/components/payment-status';
import { getCommerce } from '@/lib/commerce';
import { getConfig } from '@/lib/config';

export const metadata = { title: 'Resultado del pago' };

const ORDER_CODE = /^[A-Za-z0-9]{4,40}$/;
const PAYMENT_ID = /^[0-9]{1,20}$/;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Where Mercado Pago sends the buyer back (PRD 9.6 step 4). The URL carries `payment_id`,
 * `external_reference` and `status`, but **none of it confirms a payment**: `payment_id` and
 * `external_reference` only tell this page *which* order and payment to ask the server about.
 */
export default async function ResultPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const reference = first(params.external_reference);
  const paymentId = first(params.payment_id) ?? first(params.collection_id);

  let orderCode = reference && ORDER_CODE.test(reference) ? reference : undefined;
  if (!orderCode) {
    // Fall back to the order of this browser session.
    const commerce = await getCommerce();
    orderCode = (await commerce.cart.getCart())?.code;
  }

  return (
    <Page title="Resultado del pago">
      {orderCode ? (
        <PaymentStatus
          orderCode={orderCode}
          paymentId={paymentId && PAYMENT_ID.test(paymentId) ? paymentId : undefined}
          syncAfterMs={getConfig().syncAfterMs}
        />
      ) : (
        <p>No encontramos un pedido para mostrar. Si acabás de pagar, revisá tu email.</p>
      )}
    </Page>
  );
}
