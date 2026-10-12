/**
 * From the usage stats to sets: for each species, the most used ability, item, spread and
 * moves that are legal in Champions (`@colleja/data`). A Mega is built as its base species
 * holding its stone; its ability before evolving is the one the base species uses.
 */
import type { PokemonSet } from '@colleja/core';
import {
  canLearn,
  type GameMode,
  getAbility,
  getItem,
  getMove,
  getNature,
  getSpecies,
  getStandardSets,
  STAT_IDS,
  type StatTable,
  toId,
} from '@colleja/data';
import { standardToSet } from '@colleja/teamgen';
import type { ChaosSpecies, ChaosStats } from './smogon';

const MOVES_PER_SET = 4;
const STAT_POINTS = { total: 66, perStat: 32 };

/** The stats of a month indexed by data id (`salamencemega`, `floetteeternal`). */
export class UsageIndex {
  private readonly byId = new Map<string, ChaosSpecies>();
  /** Megas of each base species that appear in the stats, most used first. */
  private readonly megasOf = new Map<string, ChaosSpecies[]>();

  constructor(readonly stats: ChaosStats) {
    for (const entry of stats.species) {
      const id = toId(entry.name);
      const species = getSpecies(id);
      if (!species || this.byId.has(id)) continue;
      this.byId.set(id, entry);
      if (species.kind === 'mega' && species.changesFrom) {
        const list = this.megasOf.get(species.changesFrom) ?? [];
        list.push(entry);
        this.megasOf.set(species.changesFrom, list);
      }
    }
  }

  get(id: string): ChaosSpecies | undefined {
    return this.byId.get(id);
  }

  /** Every species of the stats, most used first (data ids). */
  ids(): string[] {
    return [...this.byId.keys()];
  }

  /** Usage of a species counting its Megas (0–1). */
  totalUsage(base: string): number {
    return (
      (this.byId.get(base)?.usage ?? 0) +
      (this.megasOf.get(base) ?? []).reduce((sum, entry) => sum + entry.usage, 0)
    );
  }

  /** The most used Mega of a base species and how often it is brought as that Mega (0–1). */
  megaChance(base: string): { id: string; chance: number } | null {
    const mega = this.megasOf.get(base)?.[0];
    const total = this.totalUsage(base);
    if (!mega || total <= 0) return null;
    return { id: toId(mega.name), chance: mega.usage / total };
  }
}

/** Keys of a count table, most counted first (ties by key, so the order is stable). */
export function ranked(table: Record<string, number>): string[] {
  return Object.entries(table)
    .filter(([key]) => key !== '' && key !== 'nothing')
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);
}

/** `Adamant:32/32/0/0/2/0` → nature and Stat Points (only within the Champions limits). */
export function parseSpread(spread: string): { nature: string; statPoints: StatTable } | null {
  const [natureName, values] = spread.split(':');
  const nature = toId(natureName ?? '');
  const points = (values ?? '').split('/').map(Number);
  if (!getNature(nature) || points.length !== STAT_IDS.length) return null;
  if (points.some((value) => !Number.isInteger(value) || value < 0 || value > STAT_POINTS.perStat))
    return null;
  if (points.reduce((sum, value) => sum + value, 0) > STAT_POINTS.total) return null;
  const statPoints = Object.fromEntries(
    STAT_IDS.map((stat, index) => [stat, points[index] ?? 0]),
  ) as StatTable;
  return { nature, statPoints };
}

/**
 * The most used set of a species (`id`: a data id, a Mega for its Mega form) that does not
 * repeat an item in `usedItems` (Item Clause). Falls back to the standard set of the data when
 * the species is not in the stats. `null` when nothing legal can be built.
 */
export function buildSet(
  id: string,
  usage: UsageIndex,
  mode: GameMode,
  usedItems: ReadonlySet<string> = new Set(),
): PokemonSet | null {
  const species = getSpecies(id);
  if (!species) return null;
  const mega = species.kind === 'mega';
  const base = mega ? species.changesFrom : id;
  const baseSpecies = base ? getSpecies(base) : undefined;
  if (!base || !baseSpecies || baseSpecies.kind !== 'standard') return null;
  const entry = usage.get(id);
  if (!entry) return fallbackSet(base, mode, usedItems);

  // A Mega's ability in the stats is the Mega's: before evolving it has the base one.
  const abilityTable = mega ? (usage.get(base)?.abilities ?? {}) : entry.abilities;
  const ability =
    ranked(abilityTable).find((ability) => baseSpecies.abilities.includes(ability)) ??
    [...baseSpecies.abilities].sort(
      (a, b) => (getAbility(b)?.rating ?? 0) - (getAbility(a)?.rating ?? 0),
    )[0];
  if (!ability) return null;

  let item: string | undefined;
  if (mega) {
    item = species.requiredItem ?? undefined;
    if (!item || usedItems.has(item)) return null;
  } else {
    item = ranked(entry.items).find((candidate) => {
      const data = getItem(candidate);
      return data !== undefined && data.category !== 'mega-stone' && !usedItems.has(candidate);
    });
  }

  const spread =
    ranked(entry.spreads)
      .map(parseSpread)
      .find((parsed) => parsed !== null) ?? fallbackSpread(base, mode);

  const moves = ranked(entry.moves)
    .filter((move) => getMove(move) !== undefined && canLearn(base, move))
    .slice(0, MOVES_PER_SET);
  if (moves.length === 0) return null;

  return {
    species: base,
    ...(item ? { item } : {}),
    ability,
    nature: spread.nature,
    statPoints: spread.statPoints,
    moves,
  };
}

function fallbackSpread(species: string, mode: GameMode) {
  const standard = getStandardSets(species, mode)[0];
  return standard
    ? { nature: standard.nature, statPoints: { ...standard.statPoints } }
    : {
        nature: 'serious',
        statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      };
}

/** The standard set of the data, without a repeated item (dropped if it is). */
function fallbackSet(
  species: string,
  mode: GameMode,
  usedItems: ReadonlySet<string>,
): PokemonSet | null {
  const standard = getStandardSets(species, mode).find(
    (set) => !set.item || !usedItems.has(set.item),
  );
  return standard ? standardToSet(standard) : null;
}
