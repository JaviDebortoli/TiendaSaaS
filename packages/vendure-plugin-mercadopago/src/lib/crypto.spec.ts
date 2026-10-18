import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TokenCipher } from './crypto';

const key = () => randomBytes(32).toString('base64');

describe('TokenCipher', () => {
  it('round-trips a token and never stores it in clear text', () => {
    const cipher = new TokenCipher(key());
    const encrypted = cipher.encrypt('APP_USR-1234-secret-token');
    expect(encrypted).not.toContain('APP_USR');
    expect(encrypted.startsWith('v1.')).toBe(true);
    expect(cipher.decrypt(encrypted)).toBe('APP_USR-1234-secret-token');
  });

  it('uses a fresh IV for every encryption', () => {
    const cipher = new TokenCipher(key());
    expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'));
  });

  it('rejects a ciphertext that was tampered with', () => {
    const cipher = new TokenCipher(key());
    const [version, iv, tag, ciphertext] = cipher.encrypt('token').split('.');
    const flipped = Buffer.from(ciphertext!, 'base64url');
    flipped[0] = flipped[0]! ^ 0xff;
    expect(() =>
      cipher.decrypt([version, iv, tag, flipped.toString('base64url')].join('.')),
    ).toThrow();
  });

  it('rejects decryption with another key', () => {
    const encrypted = new TokenCipher(key()).encrypt('token');
    expect(() => new TokenCipher(key()).decrypt(encrypted)).toThrow();
  });

  it('binds the ciphertext to its context (e.g. the channel)', () => {
    const cipher = new TokenCipher(key());
    const encrypted = cipher.encrypt('token', 'channel-a');
    expect(cipher.decrypt(encrypted, 'channel-a')).toBe('token');
    expect(() => cipher.decrypt(encrypted, 'channel-b')).toThrow();
    expect(() => cipher.decrypt(encrypted)).toThrow();
  });

  it('rejects keys that are not 32 bytes', () => {
    expect(() => new TokenCipher(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
    expect(() => new TokenCipher('')).toThrow(/32 bytes/);
  });

  it('rejects unknown payload formats', () => {
    const cipher = new TokenCipher(key());
    expect(() => cipher.decrypt('v2.a.b.c')).toThrow(/format/);
    expect(() => cipher.decrypt('plain-token')).toThrow(/format/);
  });
});
