/**
 * Which battle to play next. Pure (no battles, no threads): the bench asks for jobs while it
 * has free threads and records each result.
 *
 * Battles are grouped in **units**: one battle (or one pair, A and B, in a comparison) of a
 * stratum (rival and mode) with an index. The **plan** grows in rounds: the first one gives
 * every stratum its minimum; after each round (a *look*), the stopping rule is checked and, if
 * it does not stop, the next round goes to the most uncertain strata (Neyman). A round only
 * depends on the results of the previous rounds, and each battle only on its seed, so the
 * result is the same whatever the number of threads or the order in which they finish.
 *
 * So that no thread waits for the slowest battle of a round, free threads play
 * **speculative** units: the next round as the partial results predict it. When the round
 * closes, the speculative units that the real plan includes are reused (a battle depends only
 * on its stratum and index); the rest are kept in case a later round wants them.
 */
import {
  neymanAllocation,
  pairSpreadSquared,
  pairTally,
  type StopReason,
  stopReason,
  winRateSpread,
} from './stats';
import { stratumTotals } from './summary';
import type { BattleJobResult, BenchBudget, Variant } from './types';

export interface ScheduledJob {
  stratum: number;
  index: number;
  variant: Variant;
}

export type SchedulerStop = 'fixed' | StopReason | 'cap' | 'nothing-to-play';

/** Units per round after the first: never fewer than the strata, nor than this. */
const MIN_ROUND = 16;

export class BenchScheduler {
  /** Units planned per stratum (indices `0 … planned − 1`). */
  readonly planned: number[];
  readonly variants: Variant[];
  private readonly results = new Map<string, BattleJobResult>();
  private readonly started = new Set<string>();
  /** Planned jobs not handed out yet, in order. */
  private queue: ScheduledJob[] = [];
  private readonly roundSize: number;
  private readonly maxLooks: number;
  private looks = 0;
  private stop: SchedulerStop | null = null;

  constructor(
    readonly strata: number,
    private readonly budget: BenchBudget,
    paired: boolean,
  ) {
    this.variants = paired ? [0, 1] : [0];
    this.roundSize = Math.max(strata, MIN_ROUND);
    const first = budget.kind === 'fixed' ? budget.battles : budget.minPerStratum;
    this.planned = Array.from({ length: strata }, () => 0);
    if (strata === 0 || first <= 0) {
      this.stop = 'nothing-to-play';
      this.maxLooks = 1;
      return;
    }
    this.maxLooks =
      budget.kind === 'fixed'
        ? 1
        : 1 + Math.ceil(Math.max(0, budget.maxBattles - first * strata) / this.roundSize);
    this.extendPlan(Array.from({ length: strata }, () => first));
  }

  get paired(): boolean {
    return this.variants.length === 2;
  }

  /** Why the bench stopped (`null` while it must keep playing). */
  get stopped(): SchedulerStop | null {
    return this.stop;
  }

  /** Units in the plan (each one is one battle per version). */
  get plannedUnits(): number {
    return this.planned.reduce((total, count) => total + count, 0);
  }

  /** Result of a battle, if played. */
  result(stratum: number, index: number, variant: Variant): BattleJobResult | undefined {
    return this.results.get(key(stratum, index, variant));
  }

  /** The next battle to play, or `null` when there is nothing to start (wait or finished). */
  next(): ScheduledJob | null {
    if (this.stop) return null;
    while (this.queue.length > 0) {
      const job = this.queue.shift() as ScheduledJob;
      if (this.claim(job)) return job;
    }
    for (const job of this.speculativeJobs()) {
      if (this.claim(job)) return job;
    }
    return null;
  }

  /** Stores a result. Closes the round (and may stop) when the whole plan is played. */
  record(job: ScheduledJob, result: BattleJobResult): void {
    this.results.set(key(job.stratum, job.index, job.variant), result);
    while (!this.stop && this.planComplete()) this.closeRound();
  }

  /** Points and variances of the planned units of every stratum (for the stopping rule). */
  private totals() {
    return stratumTotals(this.planned, this.paired, (stratum, index, variant) =>
      this.result(stratum, index, variant),
    );
  }

  private closeRound(): void {
    this.looks++;
    if (this.budget.kind === 'fixed') {
      this.stop = 'fixed';
      return;
    }
    const totals = this.totals();
    const estimate = this.paired ? totals.difference : totals.team;
    const reason =
      estimate &&
      stopReason(estimate, {
        margin: this.budget.margin,
        paired: this.paired,
        looks: this.maxLooks,
      });
    if (reason) {
      this.stop = reason;
      return;
    }
    const left = this.budget.maxBattles - this.plannedUnits;
    if (left <= 0) {
      this.stop = 'cap';
      return;
    }
    this.extendPlan(this.allocate(Math.min(this.roundSize, left)));
  }

  /** Neyman allocation of `count` units with the results known now. */
  private allocate(count: number): number[] {
    const totals = this.totals();
    const strata = this.planned.map((battles, stratum) => {
      const tally = totals.strata[stratum];
      const spreadSquared = !tally
        ? 0.25
        : this.paired
          ? pairSpreadSquared(pairTally(tally.differences))
          : winRateSpread(tally.team) ** 2;
      return { spreadSquared, battles };
    });
    return neymanAllocation(strata, count);
  }

  private extendPlan(extra: number[]): void {
    const jobs: ScheduledJob[] = [];
    const longest = Math.max(...extra);
    // Index-major order: every stratum gets its first new battle before any gets a second.
    for (let step = 0; step < longest; step++) {
      extra.forEach((count, stratum) => {
        if (step >= count) return;
        const index = (this.planned[stratum] ?? 0) + step;
        for (const variant of this.variants) jobs.push({ stratum, index, variant });
      });
    }
    extra.forEach((count, stratum) => {
      this.planned[stratum] = (this.planned[stratum] ?? 0) + count;
    });
    this.queue.push(...jobs);
  }

  /** The next round as the partial results predict it (only while a round is open). */
  private *speculativeJobs(): Generator<ScheduledJob> {
    if (this.budget.kind === 'fixed') return;
    const left = this.budget.maxBattles - this.plannedUnits;
    if (left <= 0) return;
    const extra = this.allocate(Math.min(this.roundSize, left));
    const longest = Math.max(...extra);
    for (let step = 0; step < longest; step++) {
      for (let stratum = 0; stratum < extra.length; stratum++) {
        if (step >= (extra[stratum] ?? 0)) continue;
        const index = (this.planned[stratum] ?? 0) + step;
        for (const variant of this.variants) yield { stratum, index, variant };
      }
    }
  }

  private claim(job: ScheduledJob): boolean {
    const id = key(job.stratum, job.index, job.variant);
    if (this.started.has(id)) return false;
    this.started.add(id);
    return true;
  }

  private planComplete(): boolean {
    for (let stratum = 0; stratum < this.strata; stratum++) {
      for (let index = 0; index < (this.planned[stratum] ?? 0); index++) {
        for (const variant of this.variants) {
          if (!this.results.has(key(stratum, index, variant))) return false;
        }
      }
    }
    return true;
  }

  /** For tests and diagnostics: how many rounds were closed, and the most allowed. */
  get progress(): { looks: number; maxLooks: number } {
    return { looks: this.looks, maxLooks: this.maxLooks };
  }
}

function key(stratum: number, index: number, variant: Variant): string {
  return `${stratum}:${index}:${variant}`;
}
