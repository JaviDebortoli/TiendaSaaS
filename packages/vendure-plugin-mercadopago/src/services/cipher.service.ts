import { Inject, Injectable } from '@nestjs/common';
import { MP_PLUGIN_OPTIONS } from '../constants';
import { TokenCipher } from '../lib/crypto';
import type { ResolvedMercadoPagoOptions } from '../types';

/**
 * Builds the cipher on first use so the server can start (and the dashboard can be built) before
 * Mercado Pago credentials exist. Using a feature without a key fails with a clear message.
 */
@Injectable()
export class MercadoPagoCipherService {
  private cipher?: TokenCipher;

  constructor(@Inject(MP_PLUGIN_OPTIONS) private readonly options: ResolvedMercadoPagoOptions) {}

  encrypt(plaintext: string, context: string): string {
    return this.get().encrypt(plaintext, context);
  }

  decrypt(payload: string, context: string): string {
    return this.get().decrypt(payload, context);
  }

  private get(): TokenCipher {
    if (!this.options.tokenEncryptionKey) {
      throw new Error('Mercado Pago is not configured: MP_TOKEN_ENCRYPTION_KEY is missing.');
    }
    this.cipher ??= new TokenCipher(this.options.tokenEncryptionKey);
    return this.cipher;
  }
}
