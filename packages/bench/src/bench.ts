/**
 * The team bench: your team (and optionally a second version of it) against your rivals,
 * bot against bot, until the numbers are precise enough. The scheduler decides which battle
 * comes next; the runner (worker threads) plays them; the summary turns them into the table.
 */
import type { GameMode } from '@colleja/data';
import { teamProblems } from '@colleja/engine';
import { type BattleRunner, defaultThreads, InlineRunner, WorkerPool } from './pool';
import { BenchScheduler, type ScheduledJob } from './scheduler';
import { summarizeStrata } from './summary';
import type {
  BattleJob,
  BattleJobResult,
  BenchConfig,
  BenchFailure,
  BenchStatus,
  BenchSummary,
  SkippedStratum,
  Stratum,
} from './types';

/** Failed battles kept in the summary (the rest are only counted). */
export const MAX_FAILURES = 10;

export interface RunBenchOptions {
  /** Worker threads (default: every core but one). `0` plays inline, in this thread. */
  threads?: number;
  /** Where battles run (overrides `threads`; the caller owns it and closes it). */
  runner?: BattleRunner;
  /** Called with the table as it fills, at most every `progressIntervalMs`. */
  onProgress?: (summary: BenchSummary) => void;
  progressIntervalMs?: number;
  /** Cancels the bench: the summary so far comes back with status `cancelled`. */
  signal?: AbortSignal;
}

interface Plan {
  strata: Stratum[];
  /** Index of the opponent of each stratum. */
  opponents: number[];
  skipped: SkippedStratum[];
}

/** Rivals and modes that can be played; illegal teams are skipped and reported. */
export function planStrata(config: BenchConfig): Plan {
  const plan: Plan = { strata: [], opponents: [], skipped: [] };
  for (const mode of config.modes) {
    let blocked = false;
    for (const [who, team] of [
      ['team', config.team],
      ['versus', config.versus],
    ] as const) {
      if (!team) continue;
      const problems = teamProblems(team.members, mode);
      if (problems.length === 0) continue;
      plan.skipped.push({ mode, who, name: team.name, problems });
      blocked = true;
    }
    config.opponents.forEach((opponent, index) => {
      const problems = teamProblems(opponent.members, mode);
      if (problems.length > 0) {
        plan.skipped.push({
          mode,
          who: 'opponent',
          opponentId: opponent.id,
          name: opponent.name,
          problems,
        });
        return;
      }
      if (blocked) return;
      plan.strata.push({ opponentId: opponent.id, opponentName: opponent.name, mode });
      plan.opponents.push(index);
    });
  }
  return plan;
}

/** Seed of a battle: depends only on the base seed, the rival, the mode and the index. */
export function battleSeed(seed: string, opponentId: string, mode: GameMode, index: number) {
  return `${seed}:${opponentId}:${mode}:${index}`;
}

export async function runBench(
  config: BenchConfig,
  options: RunBenchOptions = {},
): Promise<BenchSummary> {
  const start = performance.now();
  const plan = planStrata(config);
  const paired = config.versus !== undefined;
  const scheduler = new BenchScheduler(plan.strata.length, config.budget, paired);
  const threads = options.threads ?? defaultThreads();
  const ownRunner = options.runner === undefined;
  const runner =
    options.runner ??
    (threads > 0
      ? new WorkerPool(Math.min(threads, maxUsefulThreads(config)))
      : new InlineRunner());

  const failures: BenchFailure[] = [];
  const counters = { played: 0, errors: 0, invalidChoices: 0, decisionMs: 0, decisions: 0 };
  let status: BenchStatus = 'running';
  let lastProgress = 0;

  const summary = (): BenchSummary => {
    const table = summarizeStrata(plan.strata, scheduler.planned, paired, (s, i, v) =>
      scheduler.result(s, i, v),
    );
    const result: BenchSummary = {
      status,
      ...table,
      skipped: plan.skipped,
      battles: {
        played: counters.played,
        planned: scheduler.plannedUnits * scheduler.variants.length,
        errors: counters.errors,
        invalidChoices: counters.invalidChoices,
      },
      avgDecisionMs: counters.decisions > 0 ? counters.decisionMs / counters.decisions : 0,
      elapsedMs: performance.now() - start,
      failures,
    };
    const stop = status === 'cancelled' ? 'cancelled' : scheduler.stopped;
    if (stop) result.stopReason = stop;
    return result;
  };

  const report = (force = false) => {
    if (!options.onProgress) return;
    const now = performance.now();
    if (!force && now - lastProgress < (options.progressIntervalMs ?? 0)) return;
    lastProgress = now;
    options.onProgress(summary());
  };

  const toJob = ({ stratum, index, variant }: ScheduledJob): BattleJob => {
    const { opponentId, mode } = plan.strata[stratum] as Stratum;
    const opponent = config.opponents[plan.opponents[stratum] as number];
    const team = variant === 0 ? config.team : config.versus;
    if (!opponent || !team) throw new Error('Trabajo del banco sin equipo.');
    return {
      key: `${stratum}:${index}:${variant}`,
      stratum,
      index,
      variant,
      mode,
      seed: battleSeed(config.seed, opponentId, mode, index),
      teamSide: index % 2 === 0 ? 'p1' : 'p2',
      team: team.members,
      opponent: opponent.members,
      levels: config.levels,
      options: {
        teamPreview: config.options?.teamPreview ?? true,
        openTeamSheets: config.options?.openTeamSheets ?? false,
      },
    };
  };

  try {
    await new Promise<void>((resolve) => {
      let running = 0;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        resolve();
      };
      options.signal?.addEventListener('abort', () => {
        status = 'cancelled';
        finish();
      });
      if (options.signal?.aborted) status = 'cancelled';

      const pump = () => {
        if (finished) return;
        if (status === 'cancelled' || scheduler.stopped) return finish();
        while (running < runner.concurrency) {
          const job = scheduler.next();
          if (!job) break;
          running++;
          void runner.run(toJob(job)).then((result) => {
            running--;
            if (finished) return;
            record(job, result);
            pump();
          });
        }
        if (running === 0) finish();
      };

      const record = (job: ScheduledJob, result: BattleJobResult) => {
        counters.played++;
        if (result.outcome === 'error') {
          counters.errors++;
          if (failures.length < MAX_FAILURES) {
            const battle = toJob(job);
            const { opponentId, opponentName, mode } = plan.strata[job.stratum] as Stratum;
            failures.push({
              opponentId,
              opponentName,
              mode,
              index: job.index,
              variant: job.variant,
              seed: battle.seed,
              teamSide: battle.teamSide,
              error: result.error ?? 'Error desconocido.',
            });
          }
        }
        counters.invalidChoices += result.invalidChoices;
        counters.decisionMs += result.decisionMs;
        counters.decisions += result.decisions;
        scheduler.record(job, result);
        report();
      };

      pump();
    });
    if (status === 'running') status = 'done';
  } finally {
    if (ownRunner) await runner.close();
  }
  const result = summary();
  options.onProgress?.(result);
  return result;
}

/** No more threads than battles in the first round (small benches start faster). */
function maxUsefulThreads(config: BenchConfig): number {
  const perStratum =
    config.budget.kind === 'fixed' ? config.budget.battles : config.budget.minPerStratum;
  const versions = config.versus ? 2 : 1;
  return Math.max(1, config.opponents.length * config.modes.length * perStratum * versions);
}
