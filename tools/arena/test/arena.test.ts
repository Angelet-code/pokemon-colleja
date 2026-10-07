import { describe, expect, it } from 'vitest';
import { runArena, wilsonInterval } from '../src/arena';

describe('arena', () => {
  it('plays the battles, swaps sides and counts the results', async () => {
    const seen: number[] = [];
    const result = await runArena({
      a: 1,
      b: 0,
      mode: 'singles',
      battles: 4,
      seed: 'arena-test',
      onBattle: (record) => seen.push(record.index),
    });
    expect(seen).toEqual([0, 1, 2, 3]);
    const { wins } = result;
    expect(wins.a + wins.b + wins.tie + wins.error).toBe(4);
    expect(wins.error).toBe(0);
    expect(result.invalidChoices).toBe(0);
    expect(result.failures).toEqual([]);
    expect(result.avgTurns).toBeGreaterThan(0);
    expect(result.interval[0]).toBeLessThanOrEqual(result.winRate);
    expect(result.interval[1]).toBeGreaterThanOrEqual(result.winRate);
  });

  it('is reproducible with the same seed', async () => {
    const options = { a: 2, b: 1, mode: 'doubles', battles: 2, seed: 'repro' } as const;
    const first = await runArena(options);
    const second = await runArena(options);
    expect(second.wins).toEqual(first.wins);
    expect(second.avgTurns).toBe(first.avgTurns);
  });

  it('computes Wilson intervals', () => {
    const [low, high] = wilsonInterval(80, 100);
    expect(low).toBeCloseTo(0.711, 2);
    expect(high).toBeCloseTo(0.867, 2);
    expect(wilsonInterval(0, 0)).toEqual([0, 1]);
  });

  // Short strength check (the full one is `npm run arena -- --a 2 --b 0 --battles 500`).
  it.each(['singles', 'doubles'] as const)('level 2 clearly beats level 0 in %s', async (mode) => {
    const result = await runArena({ a: 2, b: 0, mode, battles: 40, seed: 'strength' });
    expect(result.invalidChoices).toBe(0);
    expect(result.winRate).toBeGreaterThanOrEqual(0.75);
  });
});
