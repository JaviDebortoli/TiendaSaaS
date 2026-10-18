import { Injectable, OnModuleInit } from '@nestjs/common';
import { JobQueue, JobQueueService, Logger } from '@vendure/core';
import { loggerCtx, WEBHOOK_QUEUE_NAME } from '../constants';
import { MercadoPagoConnectionService } from './connection.service';
import { MercadoPagoApiError } from './mercadopago-api.service';
import { MercadoPagoPaymentProcessor } from './payment-processor.service';

export type WebhookJob =
  | {
      kind: 'payment';
      mpPaymentId: string;
      /** `user_id` the notification came with. */
      mpUserId?: string;
      /** Set when the notification arrived on the per-channel `notification_url` route. */
      channelId?: string | number;
    }
  | { kind: 'connect'; mpUserId: string };

/** Attempts per job. Mercado Pago also re-sends notifications that were never acknowledged. */
const JOB_RETRIES = 5;

/**
 * Notifications are answered immediately and processed here, on the Vendure job queue, so the
 * 22 second limit of Mercado Pago never depends on how long processing takes (PRD 9.7).
 */
@Injectable()
export class MercadoPagoWebhookService implements OnModuleInit {
  private queue!: JobQueue<WebhookJob>;

  constructor(
    private readonly jobQueueService: JobQueueService,
    private readonly processor: MercadoPagoPaymentProcessor,
    private readonly connections: MercadoPagoConnectionService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.queue = await this.jobQueueService.createQueue<WebhookJob>({
      name: WEBHOOK_QUEUE_NAME,
      process: async (job) => {
        try {
          await this.handle(job.data);
        } catch (error) {
          // Only transient failures are worth retrying; anything else is logged and dropped.
          if (error instanceof MercadoPagoApiError && error.kind !== 'unavailable') {
            Logger.warn(`Dropping webhook job: ${error.kind} ${error.message}`, loggerCtx);
            return;
          }
          Logger.error(
            `Webhook job failed: ${error instanceof Error ? error.message : String(error)}`,
            loggerCtx,
            error instanceof Error ? error.stack : undefined,
          );
          throw error;
        }
      },
    });
  }

  async enqueue(job: WebhookJob): Promise<void> {
    await this.queue.add(job, { retries: JOB_RETRIES });
  }

  /** Runs one job. Exposed for tests; production goes through the queue. */
  async handle(job: WebhookJob): Promise<void> {
    if (job.kind === 'connect') {
      const result = await this.connections.reconcileAfterConnectNotification(job.mpUserId);
      Logger.info(`mp-connect for seller ${job.mpUserId}: ${result}`, loggerCtx);
      return;
    }
    const result = await this.processor.process({
      mpPaymentId: job.mpPaymentId,
      mpUserId: job.mpUserId,
      channelId: job.channelId,
    });
    Logger.info(
      `Payment ${job.mpPaymentId}: ${result.outcome}${'reason' in result ? ` (${result.reason})` : ''}`,
      loggerCtx,
    );
  }
}
