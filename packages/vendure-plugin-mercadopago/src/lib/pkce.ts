import { createHash, randomBytes } from 'node:crypto';

/** RFC 7636 code verifier: 43-128 unreserved characters. 64 random bytes -> 86 base64url chars. */
export function generateCodeVerifier(): string {
  return randomBytes(64).toString('base64url');
}

/** `code_challenge` for `code_challenge_method=S256`: BASE64URL(SHA256(verifier)). */
export function codeChallengeS256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** Opaque, unguessable OAuth `state` (single use, stored server side). */
export function generateState(): string {
  return randomBytes(32).toString('base64url');
}
