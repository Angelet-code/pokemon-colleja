/** What a bench receives and what it reports. See docs/guias/banco.md. */
import type { BotLevel } from '@colleja/bot';
import type { PokemonSet, SideId } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import type { Estimate, StopReason } from './stats';

/** A team measured by the bench (version A) or compared with it (version B). */
export interface BenchTeam {
  id: string;
  name: string;
  members: PokemonSet[];
}

/** A rival of the bench (a saved opponent; its own difficulty is not used). */
export interface BenchOpponent {
  id: string;
  name: string;
  members: PokemonSet[];
}

/**
 * How many battles to play.
 * - `fixed`: `battles` per rival and mode (per version), all of them.
 * - `adaptive`: at least `minPerStratum` per rival and mode, then rounds that go to the most
 *   uncertain rivals (Neyman) until the 95 % interval of the total (or of the A/B difference)
 *   is within ± `margin`, or the difference is clearly not 0, or `maxBattles` (per version)
 *   are played.
 */
export type BenchBudget =
  | { kind: 'fixed'; battles: number }
  | { kind: 'adaptive'; margin: number; minPerStratum: number; maxBattles: number };

export interface BenchConfig {
  /** Version A: the team being measured. */
  team: BenchTeam;
  /** Version B (A/B comparison in pairs: same battle seeds and sides as A). */
  versus?: BenchTeam;
  opponents: BenchOpponent[];
  modes: GameMode[];
  /** Bot level of each side: the team's and the rivals'. */
  levels: { team: BotLevel; opponent: BotLevel };
  budget: BenchBudget;
  /** Base seed: the result depends only on it (never on the number of threads). */
  seed: string;
  /** Default: team preview, closed team sheets (like a normal battle). */
  options?: { teamPreview?: boolean; openTeamSheets?: boolean };
}

/** A rival and mode (a stratum of the statistics). */
export interface Stratum {
  opponentId: string;
  opponentName: string;
  mode: GameMode;
}

/** Version A (`0`) or B (`1`). */
export type Variant = 0 | 1;

/** One battle to play: everything a worker thread needs. */
export interface BattleJob {
  /** `stratum:index:variant`, unique within a bench. */
  key: string;
  stratum: number;
  index: number;
  variant: Variant;
  mode: GameMode;
  seed: string;
  /** Side of the measured team (alternates with the index to cancel the side advantage). */
  teamSide: SideId;
  team: PokemonSet[];
  opponent: PokemonSet[];
  levels: { team: BotLevel; opponent: BotLevel };
  options: { teamPreview: boolean; openTeamSheets: boolean };
}

/** Result of a battle, from the measured team's point of view. */
export type BattleOutcome = 'win' | 'loss' | 'tie' | 'error';

export interface BattleJobResult {
  outcome: BattleOutcome;
  turns: number;
  ms: number;
  invalidChoices: number;
  /** Decision time of the team's bot (to report the speed). */
  decisionMs: number;
  decisions: number;
  error?: string;
}

/** Results of one version in one stratum. */
export interface TallySummary {
  wins: number;
  losses: number;
  ties: number;
  /** Battles that could not be finished (a bot bug): never counted as losses. */
  errors: number;
  /** Finished battles (wins + losses + ties). */
  played: number;
  /** Over finished battles, ties count half. `null` before the first one. */
  winRate: number | null;
  /** Wilson 95 %. */
  interval: [number, number];
  avgTurns: number;
}

export interface StratumSummary extends Stratum {
  team: TallySummary;
  versus?: TallySummary;
  /** B − A over the pairs where both battles finished. */
  difference?: Estimate & { pairs: number };
}

export interface TotalSummary {
  /** Average over strata (each rival and mode weighs the same). */
  team: Estimate | null;
  versus?: Estimate | null;
  difference?: Estimate | null;
}

/** A rival (or the team itself) that cannot play a mode: skipped, never fatal. */
export interface SkippedStratum {
  mode: GameMode;
  /** Whose team is illegal. */
  who: 'team' | 'versus' | 'opponent';
  opponentId?: string;
  name: string;
  problems: string[];
}

/** A battle that could not be finished, to reproduce it (`seed`, sides and levels). */
export interface BenchFailure {
  opponentId: string;
  opponentName: string;
  mode: GameMode;
  index: number;
  variant: Variant;
  seed: string;
  teamSide: SideId;
  error: string;
}

export type BenchStatus = 'running' | 'done' | 'cancelled' | 'error';

export type BenchStopReason = 'fixed' | StopReason | 'cap' | 'cancelled' | 'nothing-to-play';

export interface BenchSummary {
  status: BenchStatus;
  strata: StratumSummary[];
  total: TotalSummary;
  byMode: Partial<Record<GameMode, TotalSummary>>;
  skipped: SkippedStratum[];
  /** Battles finished or failed so far (both versions), and those decided by the plan. */
  battles: { played: number; planned: number; errors: number; invalidChoices: number };
  /** Average decision time of the team's bot (ms). */
  avgDecisionMs: number;
  elapsedMs: number;
  stopReason?: BenchStopReason;
  /** The first battles that failed (at most `MAX_FAILURES`). */
  failures: BenchFailure[];
}
