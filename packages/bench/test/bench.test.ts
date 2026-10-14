import { describe, expect, it } from 'vitest';
import {
  type BenchConfig,
  type BenchOpponent,
  type BenchSummary,
  jobPriors,
  runBench,
} from '../src/index';
import { randomOpponents, TEAM_A, TEAM_B } from './helpers';

const base: BenchConfig = {
  team: TEAM_A,
  opponents: randomOpponents('singles', 2),
  modes: ['singles'],
  levels: { team: 1, opponent: 0 },
  budget: { kind: 'fixed', battles: 4 },
  seed: 'bench-test',
};

/** The deterministic part of a summary (timings and speculative battles vary). */
const table = (summary: BenchSummary) => ({
  strata: summary.strata,
  total: summary.total,
  byMode: summary.byMode,
  stopReason: summary.stopReason,
  planned: summary.battles.planned,
});

describe('team bench', () => {
  it('plays every rival and mode, alternating sides, and summarizes', async () => {
    const progress: number[] = [];
    const summary = await runBench(base, {
      threads: 0,
      onProgress: (partial) => progress.push(partial.battles.played),
    });
    expect(summary.status).toBe('done');
    expect(summary.stopReason).toBe('fixed');
    expect(summary.strata).toHaveLength(2);
    for (const row of summary.strata) {
      const { wins, losses, ties, errors } = row.team;
      expect(wins + losses + ties + errors).toBe(4);
      expect(errors).toBe(0);
    }
    expect(summary.battles).toMatchObject({ played: 8, planned: 8, errors: 0 });
    expect(summary.total.team?.mean).toBeGreaterThan(0.5); // level 1 beats level 0
    expect(summary.byMode.singles).toEqual(summary.total);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(progress.at(-1)).toBe(8);
  });

  it('weights the total by rival and plays each rival only in its modes', async () => {
    const opponents = [
      { ...(base.opponents[0] as BenchOpponent), weight: 0.75 },
      { ...(base.opponents[1] as BenchOpponent), weight: 0.25 },
      {
        id: 'doubles-only',
        name: 'Solo dobles',
        members: randomOpponents('doubles', 1)[0]?.members ?? [],
        modes: ['doubles' as const],
      },
    ];
    const summary = await runBench({ ...base, opponents }, { threads: 0 });
    expect(summary.strata.map((row) => [row.opponentId, row.weight])).toEqual([
      ['rival-0', 0.75],
      ['rival-1', 0.25],
    ]);
    const [first, second] = summary.strata.map((row) => row.team.winRate as number);
    expect(summary.total.team?.mean).toBeCloseTo(
      0.75 * (first as number) + 0.25 * (second as number),
      12,
    );
    // Equal weights: exactly the bench of before.
    const plain = await runBench(base, { threads: 0 });
    const equal = await runBench(
      { ...base, opponents: base.opponents.map((opponent) => ({ ...opponent, weight: 2 })) },
      { threads: 0 },
    );
    expect(table(equal).total).toEqual(table(plain).total);
  });

  it('skips illegal teams and rivals without aborting', async () => {
    const illegal = {
      id: 'illegal',
      name: 'Ilegal',
      members: TEAM_B.members.slice(0, 2).map((set) => ({ ...set, moves: ['notamove'] })),
    };
    const summary = await runBench(
      { ...base, opponents: [...base.opponents.slice(0, 1), illegal] },
      { threads: 0 },
    );
    expect(summary.strata.map((row) => row.opponentId)).toEqual(['rival-0']);
    expect(summary.skipped).toHaveLength(1);
    expect(summary.skipped[0]).toMatchObject({ who: 'opponent', opponentId: 'illegal' });
    expect(summary.skipped[0]?.problems.length).toBeGreaterThan(0);
  });

  it('gives a difference of exactly 0 when both versions are the same team', async () => {
    const summary = await runBench({ ...base, versus: TEAM_A }, { threads: 0 });
    for (const row of summary.strata) {
      expect(row.versus).toEqual(row.team);
      expect(row.difference?.mean).toBe(0);
    }
    expect(summary.total.difference?.mean).toBe(0);
  });

  it('is deterministic with the same seed whatever the number of threads', async () => {
    const config: BenchConfig = {
      ...base,
      versus: TEAM_B,
      budget: { kind: 'adaptive', margin: 0.2, minPerStratum: 2, maxBattles: 10 },
    };
    const inline = await runBench(config, { threads: 0 });
    const threaded = await runBench(config, { threads: 3 });
    expect(threaded.status).toBe('done');
    expect(threaded.battles.errors).toBe(0);
    expect(table(threaded)).toEqual(table(inline));
  });

  it('can be cancelled and returns what was played', async () => {
    const controller = new AbortController();
    const summary = await runBench(
      { ...base, budget: { kind: 'fixed', battles: 50 } },
      {
        threads: 0,
        onProgress: (partial) => {
          if (partial.battles.played === 3) controller.abort();
        },
        signal: controller.signal,
      },
    );
    expect(summary.status).toBe('cancelled');
    expect(summary.stopReason).toBe('cancelled');
    expect(summary.battles.played).toBeLessThan(100);
  });
});

describe('sets that are played (fase 22)', () => {
  it('sends each battle only the priors of the species in it', () => {
    const [first, second] = TEAM_A.members;
    if (!first || !second) throw new Error('Equipo vacío');
    const prior = { set: first, weight: 1 };
    const priors = { [first.species]: [prior], zzzz: [prior] };
    expect(jobPriors(priors, [first, second])).toEqual({
      setPriors: { [first.species]: [prior] },
    });
    expect(jobPriors(undefined, [first])).toEqual({});
  });
});
