import Link from 'next/link';
import { registerAction } from '@/app/actions/account';
import { ErrorBanner, Field, Notice, Page, PrimaryButton } from '@/components/ui';
import { getConfig } from '@/lib/config';

export const metadata = { title: 'Crear cuenta' };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  const { platformName } = getConfig();

  return (
    <Page title="Crear cuenta">
      <ErrorBanner message={error} />
      {sent ? (
        <Notice>
          Te enviamos un email para verificar tu cuenta. Abrí el enlace y vas a poder iniciar
          sesión.
        </Notice>
      ) : (
        <>
          <p className="mb-6 max-w-xl text-sm text-neutral-700">
            Vas a crear una cuenta de {platformName}: sirve en todas sus tiendas, con el mismo email
            y la misma contraseña.
          </p>
          <form action={registerAction} className="max-w-sm space-y-4">
            <Field label="Nombre" name="firstName" required autoComplete="given-name" />
            <Field label="Apellido" name="lastName" required autoComplete="family-name" />
            <Field label="Email" name="email" type="email" required autoComplete="email" />
            <Field
              label="Contraseña (mínimo 8 caracteres)"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <PrimaryButton type="submit">Crear cuenta</PrimaryButton>
          </form>
        </>
      )}
      <p className="mt-6 text-sm">
        <Link href="/account" className="underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </Page>
  );
}
