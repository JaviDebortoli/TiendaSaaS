import { ScheduledTask } from '@vendure/core';
import { REFRESH_TASK_ID, RELEASE_TASK_ID } from './constants';
import { MercadoPagoConnectionService } from './services/connection.service';
import { MercadoPagoOAuthService } from './services/oauth.service';
import { MercadoPagoReleaseService } from './services/release.service';

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

/**
 * Daily release of retired links whose refund period is over (PRD 9.4). Runs after the renewal, so
 * an account about to lose its tokens is not renewed first for nothing.
 */
export const releaseLinksTask = new ScheduledTask({
  id: RELEASE_TASK_ID,
  description: 'Releases retired Mercado Pago links once nothing can be refunded with them.',
  schedule: '45 3 * * *',
  timeout: 10 * 60 * 1000,
  async execute({ injector }) {
    await injector.get(MercadoPagoReleaseService).releaseDueLinks();
  },
});
