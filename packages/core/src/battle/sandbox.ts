/**
 * Hypothetical battles from one player's point of view (ADR-0010). The engine implements
 * them on top of the real simulator; the level 3 bot uses them to look a turn ahead.
 *
 * A fork never holds hidden information: the rival's sets are whatever the player assumes,
 * the rival's HP is the percentage the player sees and the random generator is new.
 */
import type { PokemonSet } from '../team/types';
import type { Choice } from './choice';
import type { ActionableRequest } from './request';
import type { SideId } from './types';

/** What the player assumes about the rival's team. */
export interface RivalAssumption {
  /** Set of each rival seen in battle, by its name (`p2a: Garchomp` → `Garchomp`). */
  seen: Readonly<Record<string, PokemonSet>>;
  /**
   * Sets for the rivals not seen yet, most likely first. The engine uses as many as the rival
   * has left unseen (it must be at least that many).
   */
  unseen: readonly PokemonSet[];
}

/** Lets a player fork the current position. Only offered while choosing moves. */
export interface BattleSandbox {
  /** The current position with the rival's sets replaced by `assumption` and a new seed. */
  fork(assumption: RivalAssumption, seed: string): SandboxBattle;
}

/** State of one Pokémon in a fork (the rival's as assumed). */
export interface SandboxPokemon {
  species: string;
  hp: number;
  maxhp: number;
  fainted: boolean;
  active: boolean;
}

/** A hypothetical battle: both sides can be played freely. */
export interface SandboxBattle {
  readonly ended: boolean;
  /** `undefined` while playing, `null` on a tie. */
  readonly winner: SideId | null | undefined;
  readonly turn: number;
  /** Decision the side must make now, or `null`. */
  request(side: SideId): ActionableRequest | null;
  /** Sends a decision. `false` if the simulator rejects it (the fork keeps waiting). */
  choose(side: SideId, choice: Choice): boolean;
  /** Lets the simulator decide for the side (its default choice). */
  chooseDefault(side: SideId): void;
  /** Protocol lines `side` has seen since the fork was made. */
  log(side: SideId): readonly string[];
  /** Brought Pokémon of a side, in team order. */
  pokemon(side: SideId): SandboxPokemon[];
  /** A copy of this position with a new seed (the copy starts with an empty log). */
  clone(seed: string): SandboxBattle;
}
