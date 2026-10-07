import { type SpeciesData, STAT_IDS, type StandardSet, type StatTable } from '@colleja/data/schema';
import { type ShowdownPokemonSet, TeamValidator } from '@colleja/showdown';
import type { ShowdownContext } from '../showdown/context';

const MAX_IVS: StatTable = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

/** Converts one of our standard sets into a Showdown set (names resolved from ids). */
export function toShowdownSet(
  { dex }: ShowdownContext,
  set: StandardSet,
  species: SpeciesData,
): ShowdownPokemonSet {
  return {
    name: species.name,
    species: species.name,
    item: set.item ? dex.items.get(set.item).name : '',
    ability: dex.abilities.get(set.ability).name,
    moves: set.moves.map((id) => dex.moves.get(id).name),
    nature: dex.natures.get(set.nature).name,
    gender: set.gender ?? '',
    evs: Object.fromEntries(STAT_IDS.map((stat) => [stat, set.statPoints[stat]])) as StatTable,
    ivs: { ...MAX_IVS },
    level: 50,
  };
}

/** Validates a set against an official Champions format. Returns the problems, or null. */
export function validateSet(
  ctx: ShowdownContext,
  set: StandardSet,
  species: SpeciesData,
  formatId: string,
): string[] | null {
  return TeamValidator.get(formatId).validateSet(toShowdownSet(ctx, set, species), {});
}
