import { generateTeam } from '@colleja/teamgen';
import { describe, expect, it } from 'vitest';
import {
  type BattleRecord,
  pairTeams,
  playArenaBattle,
  runArena,
  summarizePairs,
  wilsonInterval,
} from '../src/arena';
import { fixedLineup } from '../src/fixed-lineup';

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

describe('measuring mode: fixed lineups, mirrored pairs (fase 17)', () => {
  it('draws the same group and lead with the same seed', () => {
    const lineup = fixedLineup('doubles', 6, 'seed');
    expect(lineup).toHaveLength(4);
    expect(new Set(lineup).size).toBe(4);
    expect(lineup.every((position) => position >= 1 && position <= 6)).toBe(true);
    expect(fixedLineup('doubles', 6, 'seed')).toEqual(lineup);
    expect(fixedLineup('singles', 6, 'seed')).toHaveLength(3);
    const others = ['a', 'b', 'c', 'd', 'e'].map((seed) => fixedLineup('doubles', 6, seed).join());
    expect(new Set(others).size).toBeGreaterThan(1);
  });

  it('brings the fixed lineup and swaps the bots between the two seats of a pair', async () => {
    const records: BattleRecord[] = [];
    const options = {
      a: 2,
      b: 1,
      mode: 'doubles',
      battles: 4,
      seed: 'mirror',
      fixed: true,
    } as const;
    const result = await runArena({ ...options, onBattle: (record) => records.push(record) });
    expect(result.wins.error).toBe(0);
    for (const pair of [0, 1]) {
      const [first, second] = records.filter((record) => record.pair === pair);
      if (!first?.lineups || !second?.lineups) throw new Error('sin alineaciones');
      // Each bot plays each seat with the other's lineup: same teams, same leads.
      expect(first.aSide).not.toBe(second.aSide);
      expect(second.lineups.a).toEqual(first.lineups.b);
      expect(second.lineups.b).toEqual(first.lineups.a);
      expect(first.lineups.a).toHaveLength(4);
      expect(first.seed).toBe(second.seed);
      // The lineup is the team's, drawn from the seed.
      const [teamX] = pairTeams(options, pair);
      const order = fixedLineup('doubles', teamX.length, `mirror:doubles:${pair}:x:lineup`);
      const p1 = first.aSide === 'p1' ? first.lineups.a : first.lineups.b;
      expect(p1).toEqual(order.map((position) => teamX[position - 1]?.species));
    }
    expect(result.pairs.count).toBe(2);
  });

  it('with --fixed-group, keeps the groups of a pair and lets each bot choose its leads', async () => {
    const records: BattleRecord[] = [];
    const options = {
      a: 2,
      b: 2,
      mode: 'doubles',
      battles: 4,
      seed: 'mirror',
      fixedGroup: true,
      leads: { a: 'bot', b: 'random' },
    } as const;
    const result = await runArena({ ...options, onBattle: (record) => records.push(record) });
    expect(result.wins.error).toBe(0);
    expect(result.invalidChoices).toBe(0);
    for (const pair of [0, 1]) {
      const [first, second] = records.filter((record) => record.pair === pair);
      if (!first?.lineups || !second?.lineups) throw new Error('sin alineaciones');
      // The same groups as --fixed (the same draw) and the same battle seed.
      expect([...second.lineups.a].sort()).toEqual([...first.lineups.b].sort());
      expect(first.seed).toBe(second.seed);
      const [teamX] = pairTeams(options, pair);
      const group = fixedLineup('doubles', teamX.length, `mirror:doubles:${pair}:x:lineup`);
      const p1 = first.aSide === 'p1' ? first.lineups.a : first.lineups.b;
      expect([...p1].sort()).toEqual(group.map((position) => teamX[position - 1]?.species).sort());
    }
  });

  it('with aOracle, bot A knows what B brought (fixed modes only)', async () => {
    const options = { a: 2, b: 2, mode: 'doubles', battles: 2, seed: 'oracle' } as const;
    const result = await runArena({ ...options, fixed: true, aOracle: true });
    expect(result.wins.error).toBe(0);
    expect(result.invalidChoices).toBe(0);
    await expect(runArena({ ...options, aOracle: true })).rejects.toThrow(/fixed mode/);
  });

  it('summarizes each pair of battles', () => {
    const record = (pair: number, outcome: BattleRecord['outcome']) =>
      ({ pair, outcome }) as BattleRecord;
    const summary = summarizePairs([
      record(0, 'a'),
      record(0, 'a'),
      record(1, 'a'),
      record(1, 'b'),
      record(2, 'b'),
      record(2, 'error'),
    ]);
    expect(summary).toMatchObject({ count: 2, sweepsA: 1, splits: 1, sweepsB: 0, winRate: 0.75 });
  });
});
