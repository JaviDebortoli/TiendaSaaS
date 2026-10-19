import { MercadoPagoConnectionService } from 'vendure-plugin-mercadopago';
import { runScript, withApp } from './app';

const USAGE = `Renews Mercado Pago accounts now, like the daily scheduled task does.

Usage:
  npm run refresh-connections -w @tiendasaas/server            only those expiring soon
  npm run refresh-connections -w @tiendasaas/server -- --all   every account a store still uses (e.g. to test renewal)`;

runScript(async () => {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(USAGE);
    return;
  }
  const all = process.argv.includes('--all');
  const result = await withApp((app) =>
    // "Now" is pushed a year ahead to make every account count as expiring.
    app
      .get(MercadoPagoConnectionService)
      .refreshExpiring(all ? new Date(Date.now() + 366 * 86_400_000) : new Date()),
  );
  console.log(JSON.stringify(result));
  if (result.failed > 0) process.exitCode = 1;
});
