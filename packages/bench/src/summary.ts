/**
 * From the battles played to the numbers shown: per stratum (rival and mode) and in total,
 * always over the planned units in index order (never over speculative battles), so the
 * result does not depend on which thread finished first.
 */
import type { GameMode } from '@colleja/data';
import {
  type PairTally,
  pairEstimate,
  pairTally,
  pairVariance,
  stratifiedEstimate,
  type TotalEstimate,
  type WinTally,
  wilsonInterval,
  winRateVariance,
} from './stats';
import type {
  BattleJobResult,
  BattleOutcome,
  Stratum,
  StratumSummary,
  TallySummary,
  TotalSummary,
  Variant,
} from './types';

export type ResultLookup = (
  stratum: number,
  index: number,
  variant: Variant,
) => BattleJobResult | undefined;

const POINTS: Record<Exclude<BattleOutcome, 'error'>, number> = { win: 1, tie: 0.5, loss: 0 };

/** Points of a finished battle (`null` for an error, which never counts). */
export function outcomePoints(outcome: BattleOutcome): number | null {
  return outcome === 'error' ? null : POINTS[outcome];
}

export interface StratumTally {
  team: WinTally;
  versus: WinTally;
  /** B − A of every pair where both battles finished. */
  differences: number[];
}

export interface Totals {
  strata: StratumTally[];
  team: TotalEstimate | null;
  versus: TotalEstimate | null;
  difference: TotalEstimate | null;
}

/** Tallies of the planned units of every stratum, and the totals weighted per stratum. */
export function stratumTotals(
  planned: readonly number[],
  paired: boolean,
  lookup: ResultLookup,
): Totals {
  const strata = planned.map((count, stratum) => {
    const team: WinTally = { points: 0, finished: 0 };
    const versus: WinTally = { points: 0, finished: 0 };
    const differences: number[] = [];
    for (let index = 0; index < count; index++) {
      const a = lookup(stratum, index, 0);
      const pointsA = a ? outcomePoints(a.outcome) : null;
      if (pointsA !== null) {
        team.points += pointsA;
        team.finished++;
      }
      if (!paired) continue;
      const b = lookup(stratum, index, 1);
      const pointsB = b ? outcomePoints(b.outcome) : null;
      if (pointsB !== null) {
        versus.points += pointsB;
        versus.finished++;
      }
      if (pointsA !== null && pointsB !== null) differences.push(pointsB - pointsA);
    }
    return { team, versus, differences };
  });
  return totalsOf(strata, paired);
}

function totalsOf(strata: StratumTally[], paired: boolean): Totals {
  const rate = (tally: WinTally) =>
    tally.finished === 0
      ? []
      : [{ mean: tally.points / tally.finished, variance: winRateVariance(tally) }];
  const pairs = strata
    .map(({ differences }) => pairTally(differences))
    .filter((tally) => tally.n > 0)
    .map((tally: PairTally) => ({ mean: tally.sum / tally.n, variance: pairVariance(tally) }));
  return {
    strata,
    team: stratifiedEstimate(
      strata.flatMap(({ team }) => rate(team)),
      [0, 1],
    ),
    versus: paired
      ? stratifiedEstimate(
          strata.flatMap(({ versus }) => rate(versus)),
          [0, 1],
        )
      : null,
    difference: paired ? stratifiedEstimate(pairs, [-1, 1]) : null,
  };
}

/** Wins, losses… of one version in one stratum. */
export function tallySummary(results: readonly BattleJobResult[]): TallySummary {
  const summary: TallySummary = {
    wins: 0,
    losses: 0,
    ties: 0,
    errors: 0,
    played: 0,
    winRate: null,
    interval: [0, 1],
    avgTurns: 0,
  };
  let turns = 0;
  for (const result of results) {
    if (result.outcome === 'error') {
      summary.errors++;
      continue;
    }
    if (result.outcome === 'win') summary.wins++;
    else if (result.outcome === 'loss') summary.losses++;
    else summary.ties++;
    turns += result.turns;
  }
  summary.played = summary.wins + summary.losses + summary.ties;
  if (summary.played > 0) {
    const points = summary.wins + summary.ties / 2;
    summary.winRate = points / summary.played;
    summary.interval = wilsonInterval(points, summary.played);
    summary.avgTurns = turns / summary.played;
  }
  return summary;
}

const estimate = (total: TotalEstimate | null) =>
  total ? { mean: total.mean, interval: total.interval } : null;

function totalSummary(totals: Totals, paired: boolean): TotalSummary {
  return paired
    ? {
        team: estimate(totals.team),
        versus: estimate(totals.versus),
        difference: estimate(totals.difference),
      }
    : { team: estimate(totals.team) };
}

/** The table of the bench: one row per stratum, the total and the total of each mode. */
export function summarizeStrata(
  strata: readonly Stratum[],
  planned: readonly number[],
  paired: boolean,
  lookup: ResultLookup,
): {
  strata: StratumSummary[];
  total: TotalSummary;
  byMode: Partial<Record<GameMode, TotalSummary>>;
} {
  const totals = stratumTotals(planned, paired, lookup);
  const rows = strata.map((stratum, index): StratumSummary => {
    const played = (variant: Variant) =>
      Array.from({ length: planned[index] ?? 0 }, (_, unit) => lookup(index, unit, variant)).filter(
        (result): result is BattleJobResult => result !== undefined,
      );
    const row: StratumSummary = { ...stratum, team: tallySummary(played(0)) };
    if (paired) {
      row.versus = tallySummary(played(1));
      const tally = pairTally(totals.strata[index]?.differences ?? []);
      row.difference = { ...pairEstimate(tally), pairs: tally.n };
    }
    return row;
  });

  const byMode: Partial<Record<GameMode, TotalSummary>> = {};
  for (const mode of new Set(strata.map((stratum) => stratum.mode))) {
    const subset = totals.strata.filter((_, index) => strata[index]?.mode === mode);
    byMode[mode] = totalSummary(totalsOf(subset, paired), paired);
  }
  return { strata: rows, total: totalSummary(totals, paired), byMode };
}
