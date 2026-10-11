import { generateTeam } from '@colleja/teamgen';
import { describe, expect, it } from 'vitest';
import { pairTeams, playArenaBattle, runArena, wilsonInterval } from '../src/arena';

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

  it('fingerprints each battle by its input log (same choices, same fingerprint)', async () => {
    const options = { a: 2, b: 1, mode: 'singles', battles: 1, seed: 'print' } as const;
    const first = await playArenaBattle(options, 0);
    const again = await playArenaBattle(options, 0);
    const other = await playArenaBattle({ ...options, seed: 'print-2' }, 0);
    expect(first.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(again.fingerprint).toBe(first.fingerprint);
    expect(other.fingerprint).not.toBe(first.fingerprint);
  });

  it('draws two different teams of the pool per pair, by seed', async () => {
    const teams = ['x', 'y', 'z'].map((seed) => generateTeam('doubles', { seed }));
    const options = { a: 1, b: 0, mode: 'doubles', battles: 2, seed: 'pool', teams } as const;
    for (let pair = 0; pair < 20; pair++) {
      const [x, y] = pairTeams(options, pair);
      expect(teams).toContain(x);
      expect(teams).toContain(y);
      expect(x).not.toBe(y);
      expect(pairTeams(options, pair)).toEqual([x, y]);
    }
    const result = await runArena(options);
    expect(result.wins.error).toBe(0);
    expect(result.options).not.toHaveProperty('teams');
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
