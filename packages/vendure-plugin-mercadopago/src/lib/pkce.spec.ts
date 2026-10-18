import { describe, expect, it } from 'vitest';
import { codeChallengeS256, generateCodeVerifier, generateState } from './pkce';

describe('PKCE', () => {
  it('produces the RFC 7636 appendix B challenge', () => {
    expect(codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('generates verifiers of 43-128 unreserved characters', () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    expect(generateCodeVerifier()).not.toBe(verifier);
  });

  it('generates unguessable, unique states', () => {
    const states = new Set(Array.from({ length: 50 }, generateState));
    expect(states.size).toBe(50);
    expect([...states][0]).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
