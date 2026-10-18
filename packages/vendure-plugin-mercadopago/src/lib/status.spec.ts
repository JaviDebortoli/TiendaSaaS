import { describe, expect, it } from 'vitest';
import { mapPaymentStatus } from './status';

describe('mapPaymentStatus (PRD 9.8)', () => {
  it.each([
    ['approved', 'settle'],
    ['pending', 'pending'],
    ['in_process', 'pending'],
    ['authorized', 'pending'],
    ['rejected', 'rejected'],
    ['cancelled', 'cancelled'],
    ['refunded', 'reversed'],
    ['charged_back', 'reversed'],
    ['in_mediation', 'reversed'],
  ])('%s -> %s', (status, outcome) => {
    expect(mapPaymentStatus(status)).toBe(outcome);
  });

  it.each([['something_new'], [''], [undefined], [null]])(
    'never settles an unknown status (%s)',
    (status) => {
      expect(mapPaymentStatus(status)).toBe('unknown');
    },
  );

  it('settles only approved payments', () => {
    const statuses = ['pending', 'in_process', 'authorized', 'rejected', 'cancelled', 'refunded'];
    expect(statuses.map(mapPaymentStatus)).not.toContain('settle');
  });
});
