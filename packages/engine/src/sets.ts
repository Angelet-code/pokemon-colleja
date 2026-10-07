/**
 * Conversion between our `PokemonSet` and Showdown's set model.
 * This is the only place where both models meet.
 */
import type { Gender, PokemonSet } from '@colleja/core';
import {
  getAbility,
  getItem,
  getMove,
  getNature,
  getSpecies,
  STAT_IDS,
  type StatTable,
  toId,
} from '@colleja/data';
import type { ShowdownPokemonSet } from '@colleja/showdown';

const PERFECT_IVS: StatTable = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

/** Our set → Showdown set (English names, Stat Points in `evs`, IVs 31, given level). */
export function toShowdownSet(set: PokemonSet, level: number): ShowdownPokemonSet {
  const speciesName = getSpecies(set.species)?.name ?? set.species;
  const showdownSet: ShowdownPokemonSet = {
    name: set.nickname ?? '',
    species: speciesName,
    item: set.item ? (getItem(set.item)?.name ?? set.item) : '',
    ability: getAbility(set.ability)?.name ?? set.ability,
    moves: set.moves.map((move) => getMove(move)?.name ?? move),
    nature: getNature(set.nature)?.name ?? set.nature,
    gender: set.gender ?? '',
    evs: { ...set.statPoints },
    ivs: { ...PERFECT_IVS },
    level,
  };
  if (set.shiny) showdownSet.shiny = true;
  return showdownSet;
}

/** Showdown set → our set (ids). Level, IVs and other classic fields are dropped. */
export function fromShowdownSet(set: ShowdownPokemonSet): PokemonSet {
  const species = toId(set.species);
  const statPoints = {} as StatTable;
  for (const stat of STAT_IDS) statPoints[stat] = set.evs?.[stat] ?? 0;
  const result: PokemonSet = {
    species,
    ability: toId(set.ability),
    nature: toId(set.nature),
    statPoints,
    moves: set.moves.map(toId),
  };
  const speciesName = getSpecies(species)?.name;
  if (set.name && set.name !== speciesName && set.name !== set.species) result.nickname = set.name;
  if (set.item) result.item = toId(set.item);
  if (set.gender === 'M' || set.gender === 'F') result.gender = set.gender as Gender;
  if (set.shiny) result.shiny = true;
  return result;
}
