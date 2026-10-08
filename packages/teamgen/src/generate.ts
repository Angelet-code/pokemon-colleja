/**
 * Random legal teams built from the standard sets (`@colleja/data`). Deterministic by seed and
 * browser-safe, so the UI, the CLI and the bot arena share the same generator.
 */
import { type PokemonSet, SeededRandom } from '@colleja/core';
import {
  type GameMode,
  getFormat,
  getItem,
  getSpecies,
  getTypeEffectiveness,
  listStandardSets,
  listTypes,
  type StandardSet,
  type TypeName,
} from '@colleja/data';

export interface TeamGenOptions {
  /** Same seed → same team. Random when omitted. */
  seed?: string;
  /** Team size. Defaults to the format's (6). */
  size?: number;
  /**
   * Max Mega Stones per team. The format allows any number (Item Clause only forbids repeats),
   * but only one Pokémon can Mega Evolve per battle, so the default is 2 to keep a choice
   * (product decision, 2026-10-09).
   */
  maxMegaStones?: number;
  /** Max members weak to the same attacking type, for a bit of coherence. Default 3. */
  maxSharedWeakness?: number;
}

export const DEFAULT_MAX_MEGA_STONES = 2;
export const DEFAULT_MAX_SHARED_WEAKNESS = 3;

/** Converts a standard set from `@colleja/data` into a team member. */
export function standardToSet(standard: StandardSet): PokemonSet {
  return {
    species: standard.species,
    ...(standard.item ? { item: standard.item } : {}),
    ability: standard.ability,
    nature: standard.nature,
    statPoints: { ...standard.statPoints },
    moves: [...standard.moves],
    ...(standard.gender ? { gender: standard.gender } : {}),
  };
}

export function isMegaStone(item: string | null | undefined): boolean {
  return item ? getItem(item)?.category === 'mega-stone' : false;
}

/** Attacking types this species is weak to (×2 or more), ignoring abilities. */
export function weaknesses(species: string): TypeName[] {
  const types = getSpecies(species)?.types ?? [];
  return listTypes().filter((type) => getTypeEffectiveness(type, types) > 1);
}

/**
 * Random team from the standard sets with Species Clause (by Pokédex number), Item Clause,
 * a Mega Stone limit and a cap on shared weaknesses. Sets are shuffled and taken greedily.
 */
export function generateTeam(mode: GameMode, options: TeamGenOptions = {}): PokemonSet[] {
  const random = new SeededRandom(options.seed ?? String(Math.random()));
  const size = options.size ?? getFormat(mode).teamSize;
  const maxMegaStones = options.maxMegaStones ?? DEFAULT_MAX_MEGA_STONES;
  const maxSharedWeakness = options.maxSharedWeakness ?? DEFAULT_MAX_SHARED_WEAKNESS;

  const team: StandardSet[] = [];
  const nums = new Set<number>();
  const items = new Set<string>();
  const weakCount = new Map<TypeName, number>();
  let megaStones = 0;

  for (const standard of random.shuffle(listStandardSets(mode))) {
    const num = getSpecies(standard.species)?.num;
    if (num === undefined || nums.has(num)) continue;
    if (standard.item && items.has(standard.item)) continue;
    const mega = isMegaStone(standard.item);
    if (mega && megaStones >= maxMegaStones) continue;
    const weak = weaknesses(standard.species);
    if (weak.some((type) => (weakCount.get(type) ?? 0) >= maxSharedWeakness)) continue;

    team.push(standard);
    nums.add(num);
    if (standard.item) items.add(standard.item);
    if (mega) megaStones++;
    for (const type of weak) weakCount.set(type, (weakCount.get(type) ?? 0) + 1);
    if (team.length === size) return team.map(standardToSet);
  }
  throw new Error(`No hay sets estándar suficientes para un equipo de ${size} (${mode}).`);
}
