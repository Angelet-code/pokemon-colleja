/**
 * Why a bot chose what it chose: the options it considered and their value. Bots fill it in
 * while deciding (the decision itself never depends on it); the server shows it to the player
 * only once the turn is resolved, hiding what the player has not seen yet.
 */
import type { StatTable } from '@colleja/data';
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
  /** A Pokémon brought from team preview (`lead`: it starts on the field). No one acts. */
  | { kind: 'bring'; user?: never; species: string; lead?: boolean }
  /** A move or a Pokémon the player has not seen yet (redacted by the server). */
  | { kind: 'hidden'; user?: string };

export interface ExplainedOption {
  /**
   * One action per slot it covers (one in singles; one or two in doubles), or the Pokémon
   * brought from team preview (the leads first).
   */
  actions: ExplainedAction[];
  /** Value the bot gave it (higher is better; the unit is described by `method`). */
  score: number;
  chosen: boolean;
  /**
   * Its value against each reply of `DecisionExplanation.expected` (same order); `null` when
   * the search did not play it against that reply.
   */
  versus?: (number | null)[];
}

/** A reply of the other player the bot expected (level 3). It is about the player's own team. */
export interface ExpectedReply {
  /** The other player's actions (one per slot). */
  actions: ExplainedAction[];
  /** 0–1, as the bot weighed it. */
  probability: number;
  /** It is the counter to the bot's obvious play, weighed up because the player counters. */
  counter?: boolean;
}

/** One guess of the bot about a set of the other player (level 3). */
export interface SetGuess {
  /** 0–1. */
  probability: number;
  item?: string;
  ability: string;
  nature: string;
  statPoints: StatTable;
  moves: string[];
  /** A spread the bot came up with because no standard set fitted what it saw. */
  variant?: boolean;
}

/** What the bot believes about one Pokémon of the other player, most likely guess first. */
export interface PokemonBeliefs {
  /** Base species (Showdown id). */
  species: string;
  guesses: SetGuess[];
}

/** How a Pokémon attacks, as the bot reads its (known or guessed) set. */
export type PreviewRole = 'physical' | 'special' | 'mixed' | 'support';

/** Who moves first between two Pokémon (outside Trick Room), from the first one's side. */
export type SpeedComparison = 'faster' | 'slower' | 'tie' | 'depends';

/** The best hit of one Pokémon on another, both at full HP, as the bot estimated it. */
export interface PreviewHit {
  /** Move used; missing when the player has not seen it yet (redacted). */
  move?: string;
  /** Damage range, % of the defender's max HP. */
  min: number;
  max: number;
  /** Hits it takes to KO with the expected damage (5 = five or more). */
  hits: number;
  /** 0–1: chance that a single hit KOs. */
  koChance: number;
}

/** One of the other player's Pokémon as the bot read it at team preview (level 3). */
export interface PreviewRival {
  species: string;
  role: PreviewRole;
  /** Speed range over the bot's guesses of its set (in its battle form, with its item). */
  speed: [number, number];
  /** Notable non-attacking moves of its likely set (speed control, Fake Out, redirection…). */
  notable: string[];
  /**
   * How dangerous it is for the bot's team: its average duel against the bot's six, from
   * its side (HP balance × 100; positive = it wins its duels).
   */
  threat: number;
  /** 0–1: chance the bot gave that the player brings it. */
  brought: number;
  /** 0–1: chance the bot gave that the player leads with it. */
  lead: number;
}

/** One of the bot's own Pokémon at team preview. */
export interface PreviewOwn {
  species: string;
  /** Its speed in its battle form (Mega if it holds its stone), with its item. */
  speed: number;
}

/** How one of the bot's Pokémon and one of the other player's fare against each other. */
export interface PreviewMatchup {
  /** The bot's Pokémon. */
  own: string;
  /** The other player's Pokémon. */
  rival: string;
  /** Whether the bot's Pokémon moves first. */
  speed: SpeedComparison;
  /** The bot's best hit on the player's Pokémon. */
  dealt?: PreviewHit;
  /** The player's best hit on the bot's Pokémon (with the set the bot assumes). */
  taken?: PreviewHit;
}

/** What the bot thought of both teams at team preview (level 3). */
export interface PreviewAnalysis {
  /** The other player's six, most dangerous first. */
  rivals: PreviewRival[];
  /** The bot's own Pokémon (the ones the player has not seen in battle are redacted). */
  own: PreviewOwn[];
  matchups: PreviewMatchup[];
  /** Own Pokémon left out by the redaction (not seen in battle yet). */
  hiddenOwn?: number;
}

export interface DecisionExplanation {
  /** What was decided: the moves of a turn, the replacements after a faint or the team. */
  kind: 'moves' | 'switch' | 'team';
  /** How the options are valued, in Spanish. */
  method: string;
  /** Best first; includes the chosen one(s). */
  options: ExplainedOption[];
  /**
   * What the bot believed about the other player's Pokémon seen in battle (level 3). It is
   * about the player's own team, so it reveals nothing hidden from them.
   */
  beliefs?: PokemonBeliefs[];
  /**
   * The other player's replies the bot expected, most likely first (level 3, when choosing
   * moves). The rest of their options it thought worse for them and did not consider.
   */
  expected?: ExpectedReply[];
  /** What the bot thought of both teams before choosing its own (level 3, team preview). */
  preview?: PreviewAnalysis;
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
 * (and Pokémon brought from team preview) become `hidden`, and a Mega Evolution only shows
 * once it happened.
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
      case 'bring':
        return find(action.species) ? action : { kind: 'hidden', ...user };
      default:
        return action;
    }
  };
  const redacted: T = {
    ...explanation,
    options: explanation.options.map((option) => ({
      ...option,
      actions: option.actions.map(redact),
    })),
  };
  if (explanation.preview) redacted.preview = redactPreview(explanation.preview, find);
  return redacted;
}

/**
 * The preview analysis without the bot's Pokémon the player has not seen in battle (which
 * ones it brought is hidden) nor the moves it has not used.
 */
function redactPreview(
  preview: PreviewAnalysis,
  find: (species: string) => ViewPokemon | undefined,
): PreviewAnalysis {
  const own = preview.own.filter((pokemon) => find(pokemon.species));
  const hidden = preview.own.length - own.length + (preview.hiddenOwn ?? 0);
  const matchups = preview.matchups.flatMap((matchup): PreviewMatchup[] => {
    const pokemon = find(matchup.own);
    if (!pokemon) return [];
    if (!matchup.dealt?.move || pokemon.moves.includes(matchup.dealt.move)) return [matchup];
    const { move: _move, ...dealt } = matchup.dealt;
    return [{ ...matchup, dealt }];
  });
  return { ...preview, own, matchups, ...(hidden > 0 ? { hiddenOwn: hidden } : {}) };
}
