import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Channel, Logger, TransactionalConnection } from '@vendure/core';
import type { Response } from 'express';
import { loggerCtx, MP_PLUGIN_OPTIONS } from '../constants';
import { verifyWebhookSignature } from '../lib/signature';
import { REGISTRY_TOKEN_PATTERN } from '../services/preference-registry.service';
import { MercadoPagoWebhookService } from '../services/webhook.service';
import type { ResolvedMercadoPagoOptions } from '../types';

interface NotificationBody {
  type?: string;
  topic?: string;
  action?: string;
  user_id?: number | string;
  data?: { id?: number | string };
}

@Controller('mercadopago/webhook')
export class MercadoPagoWebhookController {
  constructor(
    private readonly webhooks: MercadoPagoWebhookService,
    private readonly connection: TransactionalConnection,
    @Inject(MP_PLUGIN_OPTIONS) private readonly options: ResolvedMercadoPagoOptions,
  ) {}

  /** App-level webhook configured in "Tus integraciones" (PRD 9.7). Always signed. */
  @Post()
  @HttpCode(200)
  receive(
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
    @Query() query: Record<string, string>,
    @Body() body: NotificationBody | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.handle({ xSignature, xRequestId, query, body, res, requireSignature: true });
  }

  /** Plan B (PRD V1/V2): `notification_url` with the channel token in the path. */
  @Post(':channelToken')
  @HttpCode(200)
  async receiveForChannel(
    @Param('channelToken') channelToken: string,
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
    @Query() query: Record<string, string>,
    @Body() body: NotificationBody | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const channel = await this.connection.rawConnection
      .getRepository(Channel)
      .findOneBy({ token: channelToken });
    if (!channel) {
      res.status(404);
      return { received: false };
    }
    return this.handle({
      xSignature,
      xRequestId,
      query,
      body,
      res,
      channelId: channel.id,
      requireSignature: this.options.requireSignatureInPreferenceMode,
    });
  }

  private async handle(params: {
    xSignature: string | undefined;
    xRequestId: string | undefined;
    query: Record<string, string>;
    body: NotificationBody | undefined;
    res: Response;
    channelId?: string | number;
    requireSignature: boolean;
  }) {
    const { xSignature, xRequestId, query, body, res, channelId, requireSignature } = params;
    const queryDataId = query['data.id'];

    // 1. Authenticity. The signature covers the `data.id` of the URL, the request id and `ts`.
    if (requireSignature) {
      if (!this.options.webhookSecret) {
        Logger.error('Webhook received but MP_WEBHOOK_SECRET is not configured.', loggerCtx);
        res.status(503);
        return { received: false };
      }
      const check = verifyWebhookSignature({
        xSignature,
        xRequestId,
        dataId: queryDataId,
        secret: this.options.webhookSecret,
        toleranceSeconds: this.options.webhookToleranceSeconds,
      });
      if (!check.valid) {
        Logger.warn(`Rejected webhook (${check.reason}), request ${xRequestId ?? '-'}`, loggerCtx);
        res.status(401);
        return { received: false };
      }
    }

    // 2. Which event? Unsigned IPN-style notifications use `topic` and `id`.
    const topic = query.type ?? query.topic ?? body?.type ?? body?.topic;
    const dataId = queryDataId ?? body?.data?.id ?? (requireSignature ? undefined : query.id);
    const mpUserId = body?.user_id !== undefined ? String(body.user_id) : undefined;
    // Only the per-preference route (`notification_url`) carries the registry identifier.
    const ref = typeof query.ref === 'string' ? query.ref : undefined;

    // One line per accepted notification: it is the evidence needed to settle V1, V2 and V13.
    Logger.info(
      `Webhook received: topic=${topic ?? '-'} id=${dataId ?? '-'} user_id=${mpUserId ?? '-'} signed=${xSignature ? 'yes' : 'no'} route=${channelId === undefined ? 'application' : 'channel'} ref=${ref ? 'yes' : 'no'}`,
      loggerCtx,
    );
    if (topic === 'payment') {
      if (dataId === undefined || dataId === '') {
        res.status(400);
        return { received: false };
      }
      await this.webhooks.enqueue({
        kind: 'payment',
        mpPaymentId: String(dataId),
        mpUserId,
        channelId,
        preferenceRef:
          channelId !== undefined && REGISTRY_TOKEN_PATTERN.test(ref ?? '') ? ref : undefined,
      });
    } else if (topic === 'mp-connect') {
      if (!mpUserId) {
        res.status(400);
        return { received: false };
      }
      await this.webhooks.enqueue({ kind: 'connect', mpUserId });
    } else {
      Logger.debug(`Ignoring webhook topic "${topic}"`, loggerCtx);
    }

    // 3. Acknowledge right away. Mercado Pago waits at most 22 seconds.
    return { received: true };
  }
}
