import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const FORMAT_VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;

/**
 * AES-256-GCM encryption for Mercado Pago tokens at rest (PRD 9.3).
 *
 * Payload format: `v1.<iv>.<authTag>.<ciphertext>` (base64url segments). An optional `context`
 * is authenticated as additional data, so a ciphertext copied to another row (for example another
 * channel's connection) fails to decrypt.
 */
export class TokenCipher {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `MP_TOKEN_ENCRYPTION_KEY must be ${KEY_BYTES} bytes encoded as base64 (e.g. \`openssl rand -base64 32\`).`,
      );
    }
    this.key = key;
  }

  encrypt(plaintext: string, context?: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    if (context) cipher.setAAD(Buffer.from(context, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [FORMAT_VERSION, iv, cipher.getAuthTag(), ciphertext]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join('.');
  }

  decrypt(payload: string, context?: string): string {
    const [version, iv, tag, ciphertext, ...rest] = payload.split('.');
    if (version !== FORMAT_VERSION || !iv || !tag || ciphertext === undefined || rest.length > 0) {
      throw new Error('Unsupported encrypted token format.');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, 'base64url'));
    if (context) decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
