import { checkTeam } from '@colleja/core';
import { getSpecies } from '@colleja/data';
import { validateTeam } from '@colleja/engine';
import { describe, expect, it } from 'vitest';
import { generateTeam, isMegaStone, weaknesses } from '../src/index';

const SEEDS = 300;

describe('generateTeam', () => {
  it.each(['singles', 'doubles'] as const)('builds legal teams for %s', (mode) => {
    for (let i = 0; i < SEEDS; i++) {
      const seed = `teamgen-${mode}-${i}`;
      const team = generateTeam(mode, { seed });
      expect(team, seed).toHaveLength(6);
      expect(checkTeam(team, mode), seed).toEqual([]);
      // The authoritative check (Showdown) only on a sample: it is slower.
      if (i % 10 === 0) expect(validateTeam(team, mode).problems, seed).toEqual([]);
    }
  });

  it('respects the clauses, the Mega Stone limit and the weakness cap', () => {
    let withMega = 0;
    for (let i = 0; i < SEEDS; i++) {
      const team = generateTeam('singles', { seed: `clauses-${i}` });
      const nums = team.map((set) => getSpecies(set.species)?.num);
      expect(new Set(nums).size).toBe(6);
      const items = team.flatMap((set) => (set.item ? [set.item] : []));
      expect(new Set(items).size).toBe(items.length);
      const megas = team.filter((set) => isMegaStone(set.item)).length;
      expect(megas).toBeLessThanOrEqual(2);
      if (megas > 0) withMega++;
      const counts = new Map<string, number>();
      for (const set of team) {
        for (const type of weaknesses(set.species)) counts.set(type, (counts.get(type) ?? 0) + 1);
      }
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);
    }
    // Most teams still bring a Mega.
    expect(withMega).toBeGreaterThan(SEEDS / 2);
  });

  it('allows more Mega Stones when asked', () => {
    const counts = Array.from({ length: 50 }, (_, i) =>
      generateTeam('doubles', { seed: `megas-${i}`, maxMegaStones: 6 }).filter((set) =>
        isMegaStone(set.item),
      ),
    ).map((megas) => megas.length);
    expect(Math.max(...counts)).toBeGreaterThan(1);
    expect(
      generateTeam('doubles', { seed: 'none', maxMegaStones: 0 }).some((set) =>
        isMegaStone(set.item),
      ),
    ).toBe(false);
  });

  it('is deterministic by seed', () => {
    expect(generateTeam('singles', { seed: 'a' })).toEqual(generateTeam('singles', { seed: 'a' }));
    expect(generateTeam('singles', { seed: 'a' })).not.toEqual(
      generateTeam('singles', { seed: 'b' }),
    );
  });
});
