import { ScheduledTask } from '@vendure/core';
import { REFRESH_TASK_ID } from './constants';
import { MercadoPagoConnectionService } from './services/connection.service';
import { MercadoPagoOAuthService } from './services/oauth.service';

/**
 * Daily renewal of Mercado Pago tokens (PRD 9.4). The default scheduler takes a database lock, so
 * the task runs once per tick however many workers are up.
 */
export const refreshConnectionsTask = new ScheduledTask({
  id: REFRESH_TASK_ID,
  description: 'Renews Mercado Pago connections that are about to expire.',
  schedule: '15 3 * * *',
  timeout: 10 * 60 * 1000,
  async execute({ injector }) {
    await injector.get(MercadoPagoConnectionService).refreshExpiring();
    await injector.get(MercadoPagoOAuthService).purgeExpiredStates();
  },
});
