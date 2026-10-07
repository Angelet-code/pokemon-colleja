import type { GameMode } from '@colleja/data';
import type { PokemonSet } from '../team/types';
import type { Choice } from './choice';
import type { DecisionExplanation } from './explanation';
import type { ActionableRequest } from './request';
import type { SideId } from './types';

/**
 * Everything a player is allowed to know when deciding: its own request and team, and the
 * protocol lines of its own perspective. Never the omniscient state (PLAN §3.1, principle 4).
 */
export interface AgentContext {
  side: SideId;
  mode: GameMode;
  request: ActionableRequest;
  /** Protocol lines seen from this side so far (rival HP in %, hidden information hidden). */
  log: readonly string[];
  /** Own team as built (before team preview). */
  team: readonly PokemonSet[];
  /** Rival's sets, only when Open Team Sheets is on. */
  opponentTeam: readonly PokemonSet[] | null;
}

/** Anything that can play a side: the random bot, smarter bots (phase 4) or a human UI. */
export interface BattleAgent {
  readonly name: string;
  choose(context: AgentContext): Choice | Promise<Choice>;
  /**
   * Why the last `choose` call chose what it did (`null` when there is nothing to explain,
   * e.g. team preview). Optional: only bots implement it, and it never changes the decision.
   */
  explain?(): DecisionExplanation | null;
}
