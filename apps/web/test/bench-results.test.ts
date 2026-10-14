import type { StratumSummaryValue } from '@colleja/protocol';
import { describe, expect, it } from 'vitest';
import { costliest, rowShares } from '../src/features/bench/BenchResults';

const row = (
  opponentId: string,
  mode: 'singles' | 'doubles',
  weight: number,
  winRate: number | null,
): StratumSummaryValue => ({
  opponentId,
  opponentName: opponentId,
  mode,
  weight,
  team: {
    wins: 0,
    losses: 0,
    ties: 0,
    errors: 0,
    played: winRate === null ? 0 : 4,
    winRate,
    interval: [0, 1],
    avgTurns: 10,
  },
});

describe('bench results against the metagame', () => {
  it('gives each row its share of the total (per mode, modes equal)', () => {
    const rows = [
      row('a', 'doubles', 3, 0.5),
      row('b', 'doubles', 1, 0.5),
      row('c', 'singles', 9, 0.5),
    ];
    const shares = rowShares(rows);
    expect(rows.map((entry) => shares.get(entry))).toEqual([0.375, 0.125, 0.5]);
    // Saved rivals carry no weight: all the same.
    const plain = rows.map(({ weight: _, ...rest }) => rest);
    expect(plain.map((entry) => rowShares(plain).get(entry))).toEqual([0.25, 0.25, 0.5]);
  });

  it('finds where the team loses most points of the total', () => {
    const rows = [
      row('common', 'doubles', 0.6, 0.6), // 0.6 × 0.4 = 0.24
      row('rare', 'doubles', 0.1, 0), // 0.1 × 1 = 0.10
      row('won', 'doubles', 0.2, 1),
      row('unplayed', 'doubles', 0.1, null),
    ];
    expect(costliest(rows).map(({ row: entry, points }) => [entry.opponentId, points])).toEqual([
      ['common', expect.closeTo(0.24, 9)],
      ['rare', expect.closeTo(0.1, 9)],
    ]);
  });
});
