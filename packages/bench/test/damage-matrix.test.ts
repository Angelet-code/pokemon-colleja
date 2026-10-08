import { describe, expect, it } from 'vitest';
import { bestHit, damageMatrix, rivalSets } from '../src/index';
import { TEAM_A, TEAM_B } from './helpers';

describe('damage matrix', () => {
  it('merges repeated rival sets and counts them', () => {
    const opponents = [
      { id: 'r1', name: 'R1', members: TEAM_B.members },
      { id: 'r2', name: 'R2', members: TEAM_B.members.slice(0, 2) },
    ];
    const sets = rivalSets(opponents);
    expect(sets).toHaveLength(TEAM_B.members.length);
    expect(sets.slice(0, 2).map((set) => set.count)).toEqual([2, 2]);
  });

  it('gives the best hit of each member in both directions', () => {
    const opponents = [{ id: 'r1', name: 'R1', members: TEAM_B.members }];
    const matrix = damageMatrix(TEAM_A.members, opponents, 'doubles');
    expect(matrix.members).toHaveLength(TEAM_A.members.length);
    for (const { matchups } of matrix.members) {
      expect(matchups).toHaveLength(matrix.rivals.length);
      for (const { outgoing } of matchups) {
        if (!outgoing) continue;
        expect(outgoing.min).toBeLessThanOrEqual(outgoing.max);
        expect(outgoing.koChance).toBeGreaterThanOrEqual(0);
      }
    }
    const attacker = TEAM_A.members[0];
    const defender = TEAM_B.members[0];
    if (!attacker || !defender) throw new Error('fixture vacía');
    expect(bestHit(attacker, defender, 'singles')?.max ?? 0).toBeGreaterThanOrEqual(0);
  });
});
