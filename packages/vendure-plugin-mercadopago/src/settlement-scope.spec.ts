import { describe, expect, it } from 'vitest';
import { isSettling, runAsSettlement } from './settlement-scope';

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('settlement scope', () => {
  it('is closed outside a settlement', () => {
    expect(isSettling(1)).toBe(false);
  });

  it('opens only for the order being settled, inside the callback', async () => {
    await runAsSettlement(7, async () => {
      expect(isSettling(7)).toBe(true);
      expect(isSettling('7')).toBe(true); // ids compare as text, like the rest of the plugin
      expect(isSettling(8)).toBe(false);
      await tick();
      expect(isSettling(7)).toBe(true); // still open after async work
    });
  });

  it('closes when the callback ends, also when it fails', async () => {
    await runAsSettlement(7, async () => undefined);
    expect(isSettling(7)).toBe(false);

    await expect(
      runAsSettlement(7, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(isSettling(7)).toBe(false);
  });

  it('does not leak to a concurrent request that is not settling', async () => {
    const seen: Record<string, boolean> = {};
    const settling = runAsSettlement(7, async () => {
      await tick();
      seen.settling = isSettling(7);
    });
    // A buyer's request running at the same time never sees the scope.
    await tick();
    seen.buyer = isSettling(7);
    await settling;

    expect(seen).toEqual({ settling: true, buyer: false });
  });

  it('keeps two settlements apart', async () => {
    const results = await Promise.all([
      runAsSettlement(1, async () => {
        await tick();
        return [isSettling(1), isSettling(2)];
      }),
      runAsSettlement(2, async () => {
        await tick();
        return [isSettling(1), isSettling(2)];
      }),
    ]);

    expect(results).toEqual([
      [true, false],
      [false, true],
    ]);
  });
});
