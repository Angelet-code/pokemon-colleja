import { describe, expect, it } from 'vitest';
import { BenchScheduler, type ScheduledJob, summarizeStrata } from '../src/index';
import { outcome } from './helpers';

/** Plays every job the scheduler hands out with `result`, in order, until it stops. */
function drain(
  scheduler: BenchScheduler,
  result: (job: ScheduledJob) => ReturnType<typeof outcome>,
): ScheduledJob[] {
  const played: ScheduledJob[] = [];
  for (let guard = 0; guard < 100_000; guard++) {
    const job = scheduler.next();
    if (!job) break;
    played.push(job);
    scheduler.record(job, result(job));
  }
  return played;
}

const alternate = (job: ScheduledJob) => outcome(job.index % 2 ? 'win' : 'loss');

describe('bench scheduler', () => {
  it('plays a fixed number of battles per stratum, index-major', () => {
    const scheduler = new BenchScheduler(3, { kind: 'fixed', battles: 2 }, false);
    const played = drain(scheduler, () => outcome('win'));
    expect(played.map((job) => [job.stratum, job.index])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
    expect(scheduler.stopped).toBe('fixed');
  });

  it('plays both versions of every unit in A/B', () => {
    const scheduler = new BenchScheduler(1, { kind: 'fixed', battles: 2 }, true);
    const played = drain(scheduler, () => outcome('tie'));
    expect(played.map((job) => job.variant)).toEqual([0, 1, 0, 1]);
  });

  it('gives the uncertain strata more battles and stops at the margin', () => {
    // Stratum 0 always wins, stratum 1 alternates: the extra battles go to stratum 1.
    const scheduler = new BenchScheduler(
      2,
      { kind: 'adaptive', margin: 0.1, minPerStratum: 6, maxBattles: 400 },
      false,
    );
    drain(scheduler, (job) => (job.stratum === 0 ? outcome('win') : alternate(job)));
    expect(scheduler.stopped).toBe('margin');
    const [sure, unsure] = scheduler.planned as [number, number];
    expect(unsure).toBeGreaterThan(sure);
  });

  it('stops at the cap', () => {
    const scheduler = new BenchScheduler(
      2,
      { kind: 'adaptive', margin: 0.001, minPerStratum: 4, maxBattles: 30 },
      false,
    );
    drain(scheduler, alternate);
    expect(scheduler.stopped).toBe('cap');
    expect(scheduler.plannedUnits).toBe(30);
  });

  it('stops an A/B comparison early when B is clearly better', () => {
    const scheduler = new BenchScheduler(
      4,
      { kind: 'adaptive', margin: 0.001, minPerStratum: 6, maxBattles: 600 },
      true,
    );
    drain(scheduler, (job) => outcome(job.variant === 1 ? 'win' : 'loss'));
    expect(scheduler.stopped).toBe('clear-difference');
    expect(scheduler.plannedUnits).toBeLessThan(100);
  });

  it('does not depend on the order in which results arrive (speculation is never counted)', () => {
    const budget = { kind: 'adaptive', margin: 0.08, minPerStratum: 4, maxBattles: 300 } as const;
    // Deterministic "battle": depends only on the stratum and the index.
    const play = (job: ScheduledJob) =>
      outcome((job.stratum * 7 + job.index * 3) % 5 < 2 + job.stratum ? 'win' : 'loss');

    const inOrder = new BenchScheduler(3, budget, false);
    drain(inOrder, play);

    // Out of order: up to 8 battles "running" at once, finishing last-in first-out.
    const shuffled = new BenchScheduler(3, budget, false);
    const running: ScheduledJob[] = [];
    for (let guard = 0; guard < 100_000 && !shuffled.stopped; guard++) {
      while (running.length < 8) {
        const job = shuffled.next();
        if (!job) break;
        running.push(job);
      }
      const job = running.pop();
      if (!job) break;
      shuffled.record(job, play(job));
    }

    expect(shuffled.stopped).toBe(inOrder.stopped);
    expect(shuffled.planned).toEqual(inOrder.planned);
    const strata = [0, 1, 2].map((index) => ({
      opponentId: `r${index}`,
      opponentName: `R${index}`,
      mode: 'singles' as const,
    }));
    const table = (scheduler: BenchScheduler) =>
      summarizeStrata(strata, scheduler.planned, false, (s, i, v) => scheduler.result(s, i, v));
    expect(table(shuffled)).toEqual(table(inOrder));
  });
});
