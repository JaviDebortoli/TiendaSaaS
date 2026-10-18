import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getCommerce } from '@/lib/commerce';
import { getConfig } from '@/lib/config';
import './globals.css';

// Everything here depends on the buyer's session and on the store's live data.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { storeName } = getConfig();
  return { title: { default: storeName, template: `%s · ${storeName}` } };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { storeName, platformName } = getConfig();
  const commerce = await getCommerce();
  const cart = await commerce.cart.getCart();
  const count = cart?.totalQuantity ?? 0;

  return (
    <html lang="es">
      <body className="flex min-h-screen flex-col font-sans">
        <header className="border-b border-neutral-200">
          <nav
            aria-label="Principal"
            className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4"
          >
            <Link href="/" className="text-lg font-semibold">
              {storeName}
            </Link>
            <ul className="flex items-center gap-5 text-sm">
              <li>
                <Link href="/">Productos</Link>
              </li>
              <li>
                <Link href="/cart">Carrito ({count})</Link>
              </li>
              <li>
                <Link href="/account">Mi cuenta</Link>
              </li>
            </ul>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-neutral-200 py-6 text-center text-xs text-neutral-600">
          Pagos con Mercado Pago · Tu cuenta es la cuenta de {platformName} y sirve en todas sus
          tiendas.
        </footer>
      </body>
    </html>
  );
}
