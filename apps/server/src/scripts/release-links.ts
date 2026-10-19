import { MercadoPagoReleaseService } from 'vendure-plugin-mercadopago';
import { runScript, withApp } from './app';

const USAGE = `Releases retired Mercado Pago links now, like the daily scheduled task does.

A retired link is released once both windows have passed: MP_RELEASE_AFTER_LAST_PAYMENT_DAYS days (180 by
default) since its last settled payment and MP_RELEASE_AFTER_RETIRED_DAYS days (30) since it was retired.
An account that no store uses any more loses its tokens.

Usage:
  npm run release-links -w @tiendasaas/server               releases every link whose period is over
  npm run release-links -w @tiendasaas/server -- --dry-run  only lists them, changes nothing`;

runScript(async () => {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(USAGE);
    return;
  }
  const dryRun = process.argv.includes('--dry-run');
  const result = await withApp((app) =>
    app.get(MercadoPagoReleaseService).releaseDueLinks(new Date(), { dryRun }),
  );
  console.log(JSON.stringify(result));
});
