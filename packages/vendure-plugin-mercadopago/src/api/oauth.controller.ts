import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MP_PLUGIN_OPTIONS } from '../constants';
import { MercadoPagoOAuthService } from '../services/oauth.service';
import type { ResolvedMercadoPagoOptions } from '../types';

/**
 * Static `redirect_uri` of the Mercado Pago application (PRD 9.2). The channel is not part of the
 * URL: it is recovered from the single-use `state`.
 */
@Controller('mercadopago/oauth')
export class MercadoPagoOAuthController {
  constructor(
    private readonly oauth: MercadoPagoOAuthService,
    @Inject(MP_PLUGIN_OPTIONS) private readonly options: ResolvedMercadoPagoOptions,
  ) {}

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.oauth.complete({ code, state, error });

    const target = new URL(this.options.dashboardUrl);
    target.searchParams.set('mp', result.ok ? 'connected' : 'error');
    if (!result.ok) {
      target.searchParams.set('reason', result.reason);
      target.searchParams.set('message', result.message);
    }
    // The code travels in the URL of this request, so nothing about it may leak further.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.redirect(302, target.toString());
  }
}
