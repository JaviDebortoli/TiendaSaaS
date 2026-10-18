import Link from 'next/link';
import { requestResetAction, resetPasswordAction } from '@/app/actions/account';
import { ErrorBanner, Field, Notice, Page, PrimaryButton } from '@/components/ui';

export const metadata = { title: 'Recuperar contraseña' };

/**
 * Two steps in one page: without a token it asks for the email; the link of the email brings the
 * token back (`/account/reset-password?token=...`) and it asks for the new password.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string; sent?: string }>;
}) {
  const { token, error, sent } = await searchParams;

  return (
    <Page title="Recuperar contraseña">
      <ErrorBanner message={error} />
      {token ? (
        <form action={resetPasswordAction} className="max-w-sm space-y-4">
          <input type="hidden" name="token" value={token} />
          <Field
            label="Nueva contraseña (mínimo 8 caracteres)"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <PrimaryButton type="submit">Guardar contraseña</PrimaryButton>
        </form>
      ) : sent ? (
        <Notice>
          Si ese email tiene una cuenta, te enviamos un enlace para elegir una nueva contraseña.
        </Notice>
      ) : (
        <form action={requestResetAction} className="max-w-sm space-y-4">
          <Field label="Email" name="email" type="email" required autoComplete="email" />
          <PrimaryButton type="submit">Enviar enlace</PrimaryButton>
        </form>
      )}
      <p className="mt-6 text-sm">
        <Link href="/account" className="underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </Page>
  );
}
