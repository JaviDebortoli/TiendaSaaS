import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  Badge,
  Button,
  defineDashboardExtension,
  Page,
  PageBlock,
  PageLayout,
  PageTitle,
} from '@vendure/dashboard';

/**
 * Dashboard page where the owner of a store links, checks and unlinks its Mercado Pago account
 * (PRD 5.4, 9.2). The tokens never reach this page: the server only says whether the account is
 * connected, and hands out the Mercado Pago authorization URL.
 */

const CONNECTION_QUERY = /* GraphQL */ `
  query MercadoPagoConnection {
    mercadoPagoConnection {
      connected
      status
      mpUserId
      expiresAt
      scope
      lastError
    }
  }
`;
const START_MUTATION = /* GraphQL */ `
  mutation StartMercadoPagoConnection {
    startMercadoPagoConnection
  }
`;
const DISCONNECT_MUTATION = /* GraphQL */ `
  mutation DisconnectMercadoPago {
    disconnectMercadoPago
  }
`;

interface ConnectionInfo {
  connected: boolean;
  status: string;
  mpUserId: string | null;
  expiresAt: string | null;
  scope: string | null;
  lastError: string | null;
}

const REASONS: Record<string, string> = {
  account_already_linked: 'Esa cuenta de Mercado Pago ya está vinculada a otra tienda.',
  access_denied: 'No se autorizó el acceso en Mercado Pago.',
  invalid_state: 'El enlace de autorización venció. Volvé a intentarlo.',
  missing_offline_access: 'La autorización no incluyó el permiso para renovar la conexión.',
  exchange_failed: 'No pudimos completar la vinculación. Volvé a intentarlo.',
};

function useReturnMessage(): { kind: 'ok' | 'error'; text: string } | undefined {
  const params = new URLSearchParams(window.location.search);
  const result = params.get('mp');
  if (result === 'connected')
    return { kind: 'ok', text: 'Tu cuenta de Mercado Pago quedó vinculada.' };
  if (result === 'error') {
    const reason = params.get('reason') ?? '';
    return {
      kind: 'error',
      text: REASONS[reason] ?? params.get('message') ?? 'No se pudo vincular la cuenta.',
    };
  }
  return undefined;
}

function statusLabel(connection: ConnectionInfo | null | undefined): string {
  if (!connection) return 'Sin vincular';
  if (connection.status === 'disconnected') return 'Desconectada';
  if (!connection.connected) return 'Vencida';
  return connection.status === 'expiring' ? 'Conectada (hay que renovarla)' : 'Conectada';
}

function MercadoPagoPage() {
  const queryClient = useQueryClient();
  const returned = useReturnMessage();
  const { data, isLoading, error } = useQuery({
    queryKey: ['mercadoPagoConnection'],
    queryFn: () =>
      api.query(CONNECTION_QUERY) as Promise<{ mercadoPagoConnection: ConnectionInfo | null }>,
  });
  const connection = data?.mercadoPagoConnection ?? null;

  const connect = useMutation({
    mutationFn: () =>
      api.mutate(START_MUTATION, {}) as Promise<{ startMercadoPagoConnection: string }>,
    // The owner continues on Mercado Pago and comes back to this page.
    onSuccess: (result) => window.location.assign(result.startMercadoPagoConnection),
  });
  const disconnect = useMutation({
    mutationFn: () => api.mutate(DISCONNECT_MUTATION, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mercadoPagoConnection'] }),
  });

  return (
    <Page pageId="mercado-pago-connection">
      <PageTitle>Mercado Pago</PageTitle>
      <PageLayout>
        <PageBlock
          column="main"
          blockId="mercado-pago-status"
          title="Cuenta que cobra los pedidos"
          description="Los pagos de esta tienda van directo a la cuenta de Mercado Pago que vincules acá."
        >
          {returned && (
            <p
              role={returned.kind === 'error' ? 'alert' : 'status'}
              className={`mb-4 rounded border px-3 py-2 text-sm ${returned.kind === 'error' ? 'border-red-300 bg-red-50 text-red-800' : 'border-green-300 bg-green-50 text-green-900'}`}
            >
              {returned.text}
            </p>
          )}
          {isLoading && <p>Cargando…</p>}
          {error && <p role="alert">No pudimos leer el estado de la conexión.</p>}
          {!isLoading && !error && (
            <div className="space-y-4">
              <p className="flex items-center gap-2">
                Estado:{' '}
                <Badge variant={connection?.connected ? 'default' : 'secondary'}>
                  {statusLabel(connection)}
                </Badge>
              </p>
              {connection?.mpUserId && (
                <p className="text-sm text-muted-foreground">
                  Cuenta de Mercado Pago n.º {connection.mpUserId}
                  {connection.expiresAt
                    ? ` · acceso vigente hasta el ${new Date(connection.expiresAt).toLocaleDateString('es-AR')}`
                    : ''}
                </p>
              )}
              {connection?.lastError && (
                <p role="alert" className="text-sm text-red-700">
                  Último problema: {connection.lastError}
                </p>
              )}
              {!connection?.connected && (
                <p className="text-sm">
                  Mientras la cuenta no esté conectada, los compradores no pueden pagar con Mercado
                  Pago en esta tienda.
                </p>
              )}
              <div className="flex gap-3">
                <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
                  {connection ? 'Volver a vincular' : 'Conectar Mercado Pago'}
                </Button>
                {connection && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (
                        window.confirm(
                          '¿Desvincular la cuenta? La tienda dejará de cobrar con Mercado Pago.',
                        )
                      ) {
                        disconnect.mutate();
                      }
                    }}
                    disabled={disconnect.isPending}
                  >
                    Desvincular
                  </Button>
                )}
              </div>
              {connect.isError && (
                <p role="alert" className="text-sm text-red-700">
                  No pudimos iniciar la vinculación. Probá de nuevo.
                </p>
              )}
            </div>
          )}
        </PageBlock>
      </PageLayout>
    </Page>
  );
}

export default defineDashboardExtension({
  routes: [
    {
      path: '/mercado-pago',
      component: () => <MercadoPagoPage />,
      navMenuItem: {
        id: 'mercado-pago',
        title: 'Mercado Pago',
        sectionId: 'settings',
      },
    },
  ],
});
