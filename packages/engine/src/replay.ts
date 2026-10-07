import type { BattleOptions, PokemonSet, RulesetId, SideId } from '@colleja/core';
import type { GameMode } from '@colleja/data';

export const REPLAY_VERSION = 1;

/**
 * Everything needed to reproduce a battle exactly: config + seed + Showdown's input log.
 * Plain JSON, stored in `storage/replays/`.
 */
export interface ReplayData {
  version: typeof REPLAY_VERSION;
  mode: GameMode;
  ruleset: RulesetId;
  /** Showdown format id the battle ran with (informative; it is derived from mode + options). */
  formatid: string;
  options: BattleOptions;
  seed: string;
  players: Record<SideId, { name: string; team: PokemonSet[] }>;
  /** Showdown's `battle.inputLog`: `>start`, `>player` and every committed choice. */
  inputLog: string[];
  /** Omniscient protocol log (without timestamps). */
  log: string[];
  /** `null` = tie, `undefined` = unfinished. */
  winner?: SideId | null;
  turns: number;
}
