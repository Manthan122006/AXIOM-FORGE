import { describe, expect, it } from 'vitest';
import { StepPacer } from '../../src/mcp/pacer';

describe('StepPacer (opt-in free-tier pacing)', () => {
  it('off by default: never waits', async () => {
    const sleeps: number[] = [];
    const p = new StepPacer(() => 0, () => 1000, async (ms) => void sleeps.push(ms));
    await p.beforeResult();
    await p.beforeResult();
    expect(sleeps).toEqual([]);
  });
  it('holds a result until the minimum interval since the previous one has passed', async () => {
    let now = 10_000;
    const sleeps: number[] = [];
    const p = new StepPacer(() => 13_000, () => now, async (ms) => {
      sleeps.push(ms);
      now += ms;
    });
    expect(await p.beforeResult()).toBe(0); // first result: nothing to space from
    now += 4_000;
    expect(await p.beforeResult()).toBe(9_000);
    now += 20_000;
    expect(await p.beforeResult()).toBe(0); // already long enough apart
    expect(sleeps).toEqual([9_000]);
  });
  it('cancellation interrupts the wait', async () => {
    const p = new StepPacer(() => 60_000);
    await p.beforeResult();
    const ac = new AbortController();
    const w = p.beforeResult(ac.signal);
    ac.abort();
    await expect(w).rejects.toThrow(/cancelled while pacing/);
  });
});
