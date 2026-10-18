import { PermissionDefinition } from '@vendure/core';

/** Lets a store administrator view, link and unlink the store's Mercado Pago account. */
export const manageMercadoPago = new PermissionDefinition({
  name: 'ManageMercadoPago',
  description: 'Link, unlink and view the Mercado Pago connection of the channel',
});
