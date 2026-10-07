/**
 * What a bot believes about each rival Pokémon. With Open Team Sheets it knows the real set;
 * otherwise it assumes one of the standard sets of that species, keeping only those that
 * agree with what has been revealed (item, ability, moves, Mega). It never peeks at hidden
 * information (PLAN §3.1, product decision of 2026-10-07).
 */
import { emptyStatTable, type PokemonSet, type ViewPokemon } from '@colleja/core';
import {
  type GameMode,
  getNature,
  getSpecies,
  getStandardSets,
  type SpeciesId,
  type StandardSet,
} from '@colleja/data';

/** What has been seen of a rival (a subset of `ViewPokemon`). */
export type RevealedInfo = Pick<
  ViewPokemon,
  'baseSpecies' | 'species' | 'item' | 'ability' | 'moves' | 'megaEvolved'
>;

/** Moves that can appear in the log without being part of the set. */
const NOT_IN_SET = new Set(['struggle', 'recharge']);

export class OpponentModel {
  constructor(
    private readonly mode: GameMode,
    private readonly opponentTeam: readonly PokemonSet[] | null = null,
  ) {}

  /** The real set, when Open Team Sheets is on. */
  knownSet(species: SpeciesId): PokemonSet | undefined {
    if (!this.opponentTeam) return undefined;
    const num = getSpecies(species)?.num;
    return (
      this.opponentTeam.find((set) => set.species === species) ??
      this.opponentTeam.find((set) => getSpecies(set.species)?.num === num)
    );
  }

  /** Sets this rival may have, most likely first. Never empty. */
  candidates(revealed: RevealedInfo): PokemonSet[] {
    const known = this.knownSet(revealed.baseSpecies);
    if (known) return [known];
    const standard = getStandardSets(revealed.baseSpecies, this.mode);
    const filters: ((set: StandardSet) => boolean)[] = [
      (set) => !revealed.megaEvolved || set.mega === revealed.species,
      (set) => !revealed.item || set.item === revealed.item,
      (set) => !revealed.ability || set.ability === revealed.ability,
      (set) => revealed.moves.every((move) => NOT_IN_SET.has(move) || set.moves.includes(move)),
    ];
    // Apply as many filters as possible: drop the least reliable ones (moves first) if no set
    // agrees with everything (e.g. a custom set).
    for (let count = filters.length; count >= 0; count--) {
      const matching = standard.filter((set) => filters.slice(0, count).every((f) => f(set)));
      if (matching.length > 0) {
        // Plan for the worst: the most offensive set first (stable for equal investment).
        const ordered = [...matching].sort((x, y) => offense(y) - offense(x));
        return ordered.map((set) => withRevealed(toSet(set), revealed));
      }
    }
    return [withRevealed(genericSet(revealed.baseSpecies), revealed)];
  }

  /** The set the bot plays around. */
  likelySet(revealed: RevealedInfo): PokemonSet {
    return this.candidates(revealed)[0] as PokemonSet;
  }

  /** Likely set of a species seen only at team preview. */
  likelySetForSpecies(species: SpeciesId): PokemonSet {
    return this.likelySet({
      baseSpecies: species,
      species,
      item: undefined,
      ability: undefined,
      moves: [],
      megaEvolved: false,
    });
  }
}

/** Offensive investment of a set: Stat Points in its best attacking stat (+ nature). */
function offense(set: StandardSet): number {
  const nature = getNature(set.nature);
  const bonus = (stat: 'atk' | 'spa') =>
    nature?.plus === stat ? 10 : nature?.minus === stat ? -10 : 0;
  return Math.max(set.statPoints.atk + bonus('atk'), set.statPoints.spa + bonus('spa'));
}

function toSet(standard: StandardSet): PokemonSet {
  return {
    species: standard.species,
    ...(standard.item ? { item: standard.item } : {}),
    ability: standard.ability,
    nature: standard.nature,
    statPoints: standard.statPoints,
    moves: standard.moves,
  };
}

/** Neutral set for a species without standard sets: no investment, first ability. */
function genericSet(species: SpeciesId): PokemonSet {
  return {
    species,
    ability: getSpecies(species)?.abilities[0] ?? '',
    nature: 'serious',
    statPoints: emptyStatTable(),
    moves: [],
  };
}

/** Puts what has been revealed on top of an assumed set. */
function withRevealed(set: PokemonSet, revealed: RevealedInfo): PokemonSet {
  const seen = revealed.moves.filter((move) => !NOT_IN_SET.has(move));
  const moves = [...seen, ...set.moves.filter((move) => !seen.includes(move))].slice(0, 4);
  return {
    ...set,
    ...(revealed.item ? { item: revealed.item } : {}),
    ability: revealed.ability ?? set.ability,
    moves,
  };
}
