/**
 * What a bot believes about each rival Pokémon. With Open Team Sheets it knows the real set;
 * otherwise it assumes one of the standard sets of that species, keeping only those that
 * agree with what has been revealed (item, ability, moves, Mega). It never peeks at hidden
 * information (PLAN §3.1, product decision of 2026-10-07).
 *
 * With set priors (fase 22, ADR-0024: the sets that are played, from the metagame) it assumes
 * those first, most likely first; if none of them agrees, the standard sets. A share of the
 * prior can be left to the standard sets that agree (`standardShare`, a measuring hook: 0).
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
import { megaSpeciesOf } from './combatant';

/** What has been seen of a rival (a subset of `ViewPokemon`). */
export type RevealedInfo = Pick<
  ViewPokemon,
  'baseSpecies' | 'species' | 'item' | 'ability' | 'moves' | 'megaEvolved'
>;

/** Moves that can appear in the log without being part of the set. */
const NOT_IN_SET = new Set(['struggle', 'recharge']);

/** A set that is played and its probability among the sets of its species. */
export interface SetPrior {
  set: PokemonSet;
  weight: number;
}

/**
 * The sets that are played, by base species (most likely first, weights adding up to 1): plain
 * data the bot never reads from disk (the server, the arena and the bench pass them).
 */
export type SetPriors = Readonly<Record<string, readonly SetPrior[]>>;

/**
 * Share of the prior left to the standard sets when there are set priors. 0: leaving them 20 %
 * lost 3 points against metagame teams and won nothing with random ones (ADR-0024).
 */
export const STANDARD_SHARE = 0;

/** A candidate set and its prior weight (1 for each standard set: equally likely). */
export interface WeightedCandidate {
  set: PokemonSet;
  weight: number;
}

export class OpponentModel {
  constructor(
    private readonly mode: GameMode,
    private readonly opponentTeam: readonly PokemonSet[] | null = null,
    /** The sets that are played (fase 22); `null`: the standard sets only. */
    readonly priors: SetPriors | null = null,
    /** With priors: the share of the prior left to the standard sets that agree (0–1). */
    readonly standardShare: number = STANDARD_SHARE,
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
    return this.match(revealed).sets;
  }

  /**
   * Sets this rival may have with their prior weight, most likely first. Never empty. Without
   * priors (or when none agrees), the standard sets, all equally likely and the most offensive
   * first ("plan for the worst").
   */
  weightedCandidates(revealed: RevealedInfo): WeightedCandidate[] {
    const { sets, weights } = this.match(revealed);
    return sets.map((set, index) => ({ set, weight: weights?.[index] ?? 1 }));
  }

  /** The candidates and, when they come from the priors, their weights. */
  private match(revealed: RevealedInfo): { sets: PokemonSet[]; weights?: number[] } {
    const known = this.knownSet(revealed.baseSpecies);
    if (known) return { sets: [known] };
    const priors = this.priors?.[revealed.baseSpecies] ?? [];
    const standard = getStandardSets(revealed.baseSpecies, this.mode);
    type Shown = { item?: string | null; ability: string; moves: readonly string[] };
    const filters: ((set: Shown, mega: SpeciesId | null) => boolean)[] = [
      (_, mega) => !revealed.megaEvolved || mega === revealed.species,
      (set) => !revealed.item || set.item === revealed.item,
      (set) => !revealed.ability || set.ability === revealed.ability,
      (set) => revealed.moves.every((move) => NOT_IN_SET.has(move) || set.moves.includes(move)),
    ];
    // Apply as many filters as possible: drop the least reliable ones (moves first) if no set
    // agrees with everything (e.g. a custom set). At each step, the priors before the standard.
    for (let count = filters.length; count >= 0; count--) {
      const active = filters.slice(0, count);
      if (priors.length > 0) {
        const likely = priors.filter((prior) =>
          active.every((f) => f(prior.set, megaSpeciesOf(prior.set))),
        );
        if (likely.length > 0) {
          const sets = likely.map((prior) => withRevealed(prior.set, revealed));
          const total = likely.reduce((sum, prior) => sum + prior.weight, 0) || 1;
          const weights = likely.map((prior) => (prior.weight / total) * (1 - this.standardShare));
          if (this.standardShare > 0) {
            const others = byOffense(
              standard.filter((set) => active.every((f) => f(set, set.mega))),
            ).filter((set) => !likely.some((prior) => sameSet(prior.set, set)));
            for (const set of others) {
              sets.push(withRevealed(toSet(set), revealed));
              weights.push(this.standardShare / others.length);
            }
          }
          return { sets, weights };
        }
      }
      const matching = standard.filter((set) => active.every((f) => f(set, set.mega)));
      if (matching.length > 0) {
        return { sets: byOffense(matching).map((set) => withRevealed(toSet(set), revealed)) };
      }
    }
    return { sets: [withRevealed(genericSet(revealed.baseSpecies), revealed)] };
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

/** Plan for the worst: the most offensive set first (stable for equal investment). */
function byOffense(sets: readonly StandardSet[]): StandardSet[] {
  return [...sets].sort((x, y) => offense(y) - offense(x));
}

/** The same set (moves in any order). */
function sameSet(set: PokemonSet, standard: StandardSet): boolean {
  return (
    (set.item ?? null) === standard.item &&
    set.ability === standard.ability &&
    set.nature === standard.nature &&
    Object.entries(standard.statPoints).every(
      ([stat, value]) => set.statPoints[stat as keyof typeof set.statPoints] === value,
    ) &&
    set.moves.length === standard.moves.length &&
    set.moves.every((move) => standard.moves.includes(move))
  );
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
