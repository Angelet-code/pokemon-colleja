import {
  getNature,
  getSpecies,
  type SpeciesId,
  STAT_IDS,
  type StatId,
  type StatTable,
} from '@colleja/data';
import type { PokemonSet, RulesetId } from './types';

/** Input of a stat calculation: just the parts of a set that affect stats. */
export type StatInput = Pick<PokemonSet, 'species' | 'nature' | 'statPoints'>;

/**
 * Computes the battle stats of a set. One implementation per ruleset, so the classic IV/EV
 * formula can be added later without touching callers.
 * `options.species` overrides the species (e.g. to get the stats of its Mega Evolution).
 */
export type StatCalculator = (set: StatInput, options?: { species?: SpeciesId }) => StatTable;

/** Nature multiplier as an integer percentage (110, 100 or 90), like the game does. */
export function natureModifier(natureId: string, stat: StatId): number {
  const nature = getNature(natureId);
  if (!nature || stat === 'hp') return 100;
  if (nature.plus === stat) return 110;
  if (nature.minus === stat) return 90;
  return 100;
}

/**
 * Champions stat formula (level 50, IVs fixed at 31):
 * - HP = Base + SP + 75
 * - Others = floor((Base + SP + 20) × nature)
 */
export function championsStat(
  stat: StatId,
  base: number,
  statPoints: number,
  nature = 100,
): number {
  if (stat === 'hp') return base === 1 ? 1 : base + statPoints + 75;
  return Math.floor(((base + statPoints + 20) * nature) / 100);
}

export const championsStats: StatCalculator = (set, options) => {
  const speciesId = options?.species ?? set.species;
  const species = getSpecies(speciesId);
  if (!species) throw new Error(`Especie desconocida: "${speciesId}".`);
  const stats = {} as StatTable;
  for (const stat of STAT_IDS) {
    stats[stat] = championsStat(
      stat,
      species.baseStats[stat],
      set.statPoints[stat],
      natureModifier(set.nature, stat),
    );
  }
  return stats;
};

const STAT_CALCULATORS: Record<RulesetId, StatCalculator> = {
  'champions-regmc': championsStats,
};

export function getStatCalculator(ruleset: RulesetId): StatCalculator {
  return STAT_CALCULATORS[ruleset];
}
