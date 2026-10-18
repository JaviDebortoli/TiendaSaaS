import { redirect } from 'next/navigation';
import { saveDetailsAction } from '@/app/actions/checkout';
import { ErrorBanner, Field, Notice, Page, PrimaryButton } from '@/components/ui';
import { getCommerce } from '@/lib/commerce';

/** Step 1 of 3. Buying as a guest is the default: no account is needed. */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const commerce = await getCommerce();
  const cart = await commerce.cart.getCart();
  if (!cart || cart.lines.length === 0) redirect('/cart');
  const customer = await commerce.account.getCustomer();
  const address = cart.shippingAddress;

  return (
    <Page title="Tus datos">
      <p className="mb-4 text-sm text-neutral-600">Paso 1 de 3 · Datos y dirección</p>
      <ErrorBanner message={error} />
      {customer ? (
        <Notice>
          Compras como {customer.firstName} {customer.lastName} ({customer.emailAddress}).
        </Notice>
      ) : (
        <Notice>
          Podés comprar sin crear una cuenta. Solo necesitamos un email para enviarte el
          comprobante.
        </Notice>
      )}
      <form action={saveDetailsAction} className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <Field
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={customer?.emailAddress ?? cart.customer?.emailAddress ?? ''}
          readOnly={!!customer}
          className="sm:col-span-2"
        />
        <Field
          label="Nombre"
          name="firstName"
          required
          autoComplete="given-name"
          defaultValue={customer?.firstName ?? cart.customer?.firstName ?? ''}
        />
        <Field
          label="Apellido"
          name="lastName"
          required
          autoComplete="family-name"
          defaultValue={customer?.lastName ?? cart.customer?.lastName ?? ''}
        />
        <Field
          label="Teléfono"
          name="phoneNumber"
          type="tel"
          autoComplete="tel"
          defaultValue={address?.phoneNumber ?? ''}
        />
        <Field
          label="Calle y número"
          name="streetLine1"
          required
          autoComplete="address-line1"
          defaultValue={address?.streetLine1 ?? ''}
        />
        <Field
          label="Piso / departamento"
          name="streetLine2"
          autoComplete="address-line2"
          defaultValue={address?.streetLine2 ?? ''}
        />
        <Field
          label="Ciudad"
          name="city"
          required
          autoComplete="address-level2"
          defaultValue={address?.city ?? ''}
        />
        <Field
          label="Provincia"
          name="province"
          autoComplete="address-level1"
          defaultValue={address?.province ?? ''}
        />
        <Field
          label="Código postal"
          name="postalCode"
          autoComplete="postal-code"
          defaultValue={address?.postalCode ?? ''}
        />
        <div className="sm:col-span-2">
          <PrimaryButton type="submit">Continuar a la entrega</PrimaryButton>
        </div>
      </form>
    </Page>
  );
}
