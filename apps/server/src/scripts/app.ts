import { INestApplicationContext } from '@nestjs/common';
import {
  bootstrapWorker,
  RequestContext,
  RequestContextService,
  runMigrations,
  UserService,
} from '@vendure/core';
import { assertEnv, env } from '../env';
import { config } from '../vendure-config';

/**
 * Runs a script against the real application (database, services, plugins) without starting the
 * HTTP server. Migrations are applied first so a fresh database works too.
 */
export async function withApp<T>(work: (app: INestApplicationContext) => Promise<T>): Promise<T> {
  assertEnv();
  await runMigrations(config);
  const worker = await bootstrapWorker(config);
  try {
    return await work(worker.app);
  } finally {
    await worker.app.close();
  }
}

export function runScript(main: () => Promise<void>): void {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}

/**
 * A context that acts as the superadmin. Creating roles checks that whoever creates them holds
 * the permissions being granted, so scripts cannot use an anonymous admin context.
 */
export async function superAdminContext(app: INestApplicationContext): Promise<RequestContext> {
  const contexts = app.get(RequestContextService);
  const anonymous = await contexts.create({ apiType: 'admin' });
  const user = await app
    .get(UserService)
    .getUserByEmailAddress(anonymous, env.superadmin.username, 'administrator');
  if (!user) throw new Error('The superadmin user was not found.');
  return contexts.create({ apiType: 'admin', user });
}
