/**
 * Why a bot chose what it chose: the options it considered and their value. Bots fill it in
 * while deciding (the decision itself never depends on it); the server shows it to the player
 * only once the turn is resolved, hiding what the player has not seen yet.
 */
import type { SideId } from './types';
import type { BattleView, ViewPokemon } from './view';

/** One slot's action in readable form (ids, not request indexes). */
export type ExplainedAction =
  | {
      kind: 'move';
      /** Species using the move (Showdown id). */
      user: string;
      move: string;
      /** Species of the target, when the move has one. */
      target?: string;
      /** Side of the target (`targetSide === user's side` = its ally). */
      targetSide?: SideId;
      mega?: boolean;
    }
  | { kind: 'switch'; user?: string; species: string }
  | { kind: 'pass'; user?: string }
  /** A move or a Pokémon the player has not seen yet (redacted by the server). */
  | { kind: 'hidden'; user?: string };

export interface ExplainedOption {
  /** One action per slot it covers (one in singles; one or two in doubles). */
  actions: ExplainedAction[];
  /** Value the bot gave it (higher is better; the unit is described by `method`). */
  score: number;
  chosen: boolean;
}

export interface DecisionExplanation {
  /** What was decided: the moves of a turn or the replacements after a faint. */
  kind: 'moves' | 'switch';
  /** How the options are valued, in Spanish. */
  method: string;
  /** Best first; includes the chosen one(s). */
  options: ExplainedOption[];
}

/** An explanation tied to the turn it was made for. */
export interface TurnExplanation extends DecisionExplanation {
  turn: number;
}

/** Options kept in an explanation (the best ones plus the chosen ones). */
export const MAX_EXPLAINED_OPTIONS = 8;

/**
 * Sorts by score, keeps the best `MAX_EXPLAINED_OPTIONS` and makes sure every chosen option
 * stays (a random tie-break may pick one below the cut).
 */
export function topOptions(options: readonly ExplainedOption[]): ExplainedOption[] {
  const sorted = [...options].sort((a, b) => b.score - a.score);
  const kept = sorted.slice(0, MAX_EXPLAINED_OPTIONS);
  for (const option of sorted.slice(MAX_EXPLAINED_OPTIONS)) {
    if (option.chosen) kept.push(option);
  }
  return kept;
}

/**
 * What a player may see of the explanation of `side`'s decision, given what it has seen of
 * the battle (`view`, its own perspective): moves not used yet and Pokémon not seen in battle
 * become `hidden`, and a Mega Evolution only shows once it happened.
 */
export function redactExplanation<T extends DecisionExplanation>(
  explanation: T,
  view: BattleView,
  side: SideId,
): T {
  const seen = view.sides[side].pokemon;
  const find = (species: string | undefined): ViewPokemon | undefined =>
    species === undefined
      ? undefined
      : seen.find((pokemon) => pokemon.species === species || pokemon.baseSpecies === species);
  const redact = (action: ExplainedAction): ExplainedAction => {
    const user = action.user === undefined ? {} : { user: action.user };
    switch (action.kind) {
      case 'move': {
        const pokemon = find(action.user);
        if (!pokemon?.moves.includes(action.move)) return { kind: 'hidden', ...user };
        if (action.mega && !pokemon.megaEvolved) {
          const { mega: _mega, ...rest } = action;
          return rest;
        }
        return action;
      }
      case 'switch':
        return find(action.species) ? action : { kind: 'hidden', ...user };
      default:
        return action;
    }
  };
  return {
    ...explanation,
    options: explanation.options.map((option) => ({
      ...option,
      actions: option.actions.map(redact),
    })),
  };
}
