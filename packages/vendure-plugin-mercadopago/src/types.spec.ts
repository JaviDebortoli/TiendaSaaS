import { describe, expect, it } from 'vitest';
import { resolveOptions } from './types';

const BASE = {
  clientId: 'id',
  clientSecret: 'secret',
  webhookSecret: 'hook',
  redirectUri: 'https://x.test/cb',
  tokenEncryptionKey: '',
  publicUrl: 'https://x.test',
  dashboardUrl: 'https://x.test/dashboard',
};

describe('resolveOptions', () => {
  it('releases a retired link after 180 days since its last payment and 30 since it was retired', () => {
    expect(resolveOptions(BASE)).toMatchObject({
      releaseAfterLastPaymentDays: 180,
      releaseAfterRetiredDays: 30,
    });
  });

  it('takes both windows from the options', () => {
    expect(
      resolveOptions({ ...BASE, releaseAfterLastPaymentDays: 90, releaseAfterRetiredDays: 7 }),
    ).toMatchObject({ releaseAfterLastPaymentDays: 90, releaseAfterRetiredDays: 7 });
  });

  it('refuses a window that is not a number of days, instead of never releasing anything', () => {
    expect(() => resolveOptions({ ...BASE, releaseAfterRetiredDays: Number('abc') })).toThrow(
      /releaseAfterRetiredDays/,
    );
    expect(() => resolveOptions({ ...BASE, releaseAfterLastPaymentDays: -1 })).toThrow(
      /releaseAfterLastPaymentDays/,
    );
  });
});
