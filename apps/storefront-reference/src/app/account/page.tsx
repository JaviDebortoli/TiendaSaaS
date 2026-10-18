import Link from 'next/link';
import { loginAction, logoutAction } from '@/app/actions/account';
import { ErrorBanner, Field, Money, Page, PrimaryButton, SecondaryButton } from '@/components/ui';
import { getCommerce } from '@/lib/commerce';
import { getConfig } from '@/lib/config';

export const metadata = { title: 'Mi cuenta' };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { platformName, storeName } = getConfig();
  const commerce = await getCommerce();
  const customer = await commerce.account.getCustomer();

  if (!customer) {
    return (
      <Page title="Mi cuenta">
        <ErrorBanner message={error} />
        <p className="mb-6 max-w-xl text-sm text-neutral-700">
          La cuenta es opcional: podés comprar sin crearla. Es una cuenta de {platformName}, por lo
          que con el mismo email y contraseña también entrás en las otras tiendas. Cada tienda ve
          tus datos solo después de que compres o inicies sesión en ella.
        </p>
        <form action={loginAction} className="max-w-sm space-y-4">
          <Field label="Email" name="email" type="email" required autoComplete="email" />
          <Field
            label="Contraseña"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
          <PrimaryButton type="submit">Iniciar sesión</PrimaryButton>
        </form>
        <p className="mt-6 text-sm">
          ¿No tenés cuenta?{' '}
          <Link href="/account/register" className="underline">
            Crear una cuenta
          </Link>
        </p>
      </Page>
    );
  }

  const orders = await commerce.account.listOrders({ take: 20 });

  return (
    <Page title="Mi cuenta">
      <ErrorBanner message={error} />
      <p className="mb-6">
        {customer.firstName} {customer.lastName} · {customer.emailAddress}
      </p>
      <h2 className="mb-3 font-medium">Tus pedidos en {storeName}</h2>
      {orders.items.length === 0 ? (
        <p className="text-sm">Todavía no hiciste pedidos en esta tienda.</p>
      ) : (
        <table className="w-full max-w-2xl text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-300">
              <th className="py-2">Pedido</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.items.map((order) => (
              <tr key={order.id} className="border-b border-neutral-200">
                <td className="py-2 font-mono">{order.code}</td>
                <td>
                  {order.orderPlacedAt
                    ? new Date(order.orderPlacedAt).toLocaleDateString('es-AR')
                    : '—'}
                </td>
                <td>{order.state}</td>
                <td className="text-right">
                  <Money cents={order.totalWithTax} currency={order.currencyCode} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form action={logoutAction} className="mt-8">
        <SecondaryButton type="submit">Cerrar sesión</SecondaryButton>
      </form>
    </Page>
  );
}
