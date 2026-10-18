import { parseArgs } from 'node:util';
import { StoreProvisioningService } from '../platform/provisioning.service';
import { runScript, superAdminContext, withApp } from './app';

const USAGE = `Creates a store: seller, channel, scoped owner, stock location, delivery and payment methods.

Usage:
  npm run provision-store -w @tiendasaas/server -- \
    --name "Tienda A" --code tienda-a \
    --owner-email dueno@tienda-a.com --owner-first-name Ana --owner-last-name Pérez \
    [--owner-password <min 10 chars>] [--token <channel token>] \
    [--storefront-url https://tienda-a.com] [--contact-email ...] [--cuit ...] [--logo-url ...] \
    [--flat-rate <cents>] [--flat-rate-minimum <cents>]

Amounts are in cents (ARS, taxes included). The owner password is generated and printed once
when --owner-password is not given.`;

runScript(async () => {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      code: { type: 'string' },
      token: { type: 'string' },
      'storefront-url': { type: 'string' },
      'owner-email': { type: 'string' },
      'owner-first-name': { type: 'string' },
      'owner-last-name': { type: 'string' },
      'owner-password': { type: 'string' },
      'contact-email': { type: 'string' },
      cuit: { type: 'string' },
      'logo-url': { type: 'string' },
      'flat-rate': { type: 'string' },
      'flat-rate-minimum': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const missing = ['name', 'code', 'owner-email', 'owner-first-name', 'owner-last-name'].filter(
    (key) => !values[key as keyof typeof values],
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing required options: ${missing.map((m) => `--${m}`).join(', ')}\n\n${USAGE}`,
    );
  }

  const store = await withApp(async (app) => {
    const ctx = await superAdminContext(app);
    return app.get(StoreProvisioningService).provision(ctx, {
      name: values.name!,
      code: values.code!,
      token: values.token,
      storefrontUrl: values['storefront-url'],
      ownerEmail: values['owner-email']!,
      ownerFirstName: values['owner-first-name']!,
      ownerLastName: values['owner-last-name']!,
      ownerPassword: values['owner-password'],
      contactEmail: values['contact-email'],
      cuit: values.cuit,
      logoUrl: values['logo-url'],
      flatRate: values['flat-rate'] === undefined ? undefined : Number(values['flat-rate']),
      flatRateMinimum:
        values['flat-rate-minimum'] === undefined ? undefined : Number(values['flat-rate-minimum']),
    });
  });

  console.log(JSON.stringify(store, null, 2));
  if (store.generatedPassword) {
    console.log('\nThe generated owner password is shown only now. Store it somewhere safe.');
  }
});
