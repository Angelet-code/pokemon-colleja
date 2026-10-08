/**
 * `@colleja/bench`: the team bench (Node-only, worker threads). Your saved team against your
 * saved rivals, bot against bot, with early stopping, adaptive allocation and A/B comparison
 * in pairs. See docs/guias/banco.md and ADR-0013.
 */
export { battleSeed, planStrata, type RunBenchOptions, runBench } from './bench';
export {
  bestHit,
  type DamageCell,
  damageMatrix,
  type MemberMatchups,
  type RivalSet,
  rivalSets,
} from './damage-matrix';
export { failedJob, playBenchJob } from './job';
export { type BattleRunner, defaultThreads, InlineRunner, WorkerPool } from './pool';
export { BenchScheduler, type ScheduledJob, type SchedulerStop } from './scheduler';
export * from './stats';
export { outcomePoints, stratumTotals, summarizeStrata, tallySummary } from './summary';
export * from './types';
