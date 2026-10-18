import { verifyAction } from '@/app/actions/account';
import { ErrorBanner, Field, Page, PrimaryButton } from '@/components/ui';

export const metadata = { title: 'Verificar cuenta' };

/** Target of the link in the verification email: `/account/verify?token=...`. */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  return (
    <Page title="Verificar tu cuenta">
      <ErrorBanner message={error} />
      {token ? (
        <form action={verifyAction} className="max-w-sm space-y-4">
          <input type="hidden" name="token" value={token} />
          <p className="text-sm text-neutral-700">
            Confirmá tu email para activar la cuenta. Si todavía no elegiste una contraseña, ponela
            acá; si ya la elegiste al registrarte, dejá el campo vacío.
          </p>
          <Field
            label="Contraseña (solo si todavía no elegiste una)"
            name="password"
            type="password"
            autoComplete="new-password"
          />
          <PrimaryButton type="submit">Verificar</PrimaryButton>
        </form>
      ) : (
        <p>El enlace de verificación no es válido.</p>
      )}
    </Page>
  );
}
