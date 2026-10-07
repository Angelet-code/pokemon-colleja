import {
  type SpeciesData,
  type SpeciesKind,
  STAT_IDS,
  type StatTable,
  type TypeName,
} from '@colleja/data/schema';
import { toID } from '@colleja/showdown';
import type { ShowdownContext } from './context';

type DexSpecies = ReturnType<ShowdownContext['dex']['species']['get']>;

const KIND_ORDER: Record<SpeciesKind, number> = { standard: 0, 'battle-only': 1, mega: 2 };

function kindOf(species: DexSpecies): SpeciesKind {
  if (species.isMega) return 'mega';
  if (species.battleOnly) return 'battle-only';
  return 'standard';
}

/** Species a Mega / battle-only forme transforms from. */
function sourceForme(species: DexSpecies): string | null {
  if (species.changesFrom) return toID(species.changesFrom);
  const battleOnly = species.battleOnly;
  if (!battleOnly) return null;
  return toID(Array.isArray(battleOnly) ? (battleOnly[0] ?? '') : battleOnly);
}

function statTable(stats: StatTable): StatTable {
  return Object.fromEntries(STAT_IDS.map((stat) => [stat, stats[stat]])) as StatTable;
}

/**
 * Every species usable in Champions, plus the Megas and battle-only formes they can turn into.
 *
 * Legality comes from the Champions mod (`isNonstandard` unset). Cosmetic formes are folded into
 * their base species, and Megas / battle-only formes are kept only if their base forme is legal
 * (Showdown leaves e.g. Meloetta-Pirouette without a `formats-data` entry even though Meloetta
 * itself is not in Champions).
 */
export function extractSpecies({ dex }: ShowdownContext): SpeciesData[] {
  const candidates = dex.species
    .all()
    .filter((s) => s.exists && !s.isNonstandard && s.num > 0 && !s.isCosmeticForme);

  const standardIds = new Set<string>(
    candidates.filter((s) => kindOf(s) === 'standard').map((s) => s.id),
  );
  const isLegalItem = (name: string) => {
    const item = dex.items.get(name);
    return item.exists && !item.isNonstandard;
  };

  const legal = candidates.filter((s) => {
    const kind = kindOf(s);
    if (kind === 'standard') return true;
    const from = sourceForme(s);
    if (!from || !standardIds.has(from)) return false;
    return kind !== 'mega' || (s.requiredItem !== undefined && isLegalItem(s.requiredItem));
  });

  const megasBySource = new Map<string, string[]>();
  for (const s of legal) {
    if (kindOf(s) !== 'mega') continue;
    const from = sourceForme(s) as string;
    megasBySource.set(from, [...(megasBySource.get(from) ?? []), s.id]);
  }

  return legal
    .map((s): SpeciesData => {
      const kind = kindOf(s);
      const abilitySlots = [s.abilities['0'], s.abilities['1'], s.abilities.H];
      return {
        id: s.id,
        name: s.name,
        num: s.num,
        baseSpecies: toID(s.baseSpecies),
        forme: s.forme || null,
        types: [...s.types] as TypeName[],
        baseStats: statTable(s.baseStats),
        bst: s.bst,
        abilities: [...new Set(abilitySlots.filter((a): a is string => !!a).map((a) => toID(a)))],
        weightkg: s.weightkg,
        gender: s.gender || null,
        kind,
        changesFrom: kind === 'standard' ? null : sourceForme(s),
        requiredItem: kind === 'mega' && s.requiredItem ? toID(s.requiredItem) : null,
        megas: kind === 'standard' ? (megasBySource.get(s.id) ?? []) : [],
        cosmeticFormes: [...(s.cosmeticFormes ?? [])],
        pokeapiId: null,
      };
    })
    .sort(
      (a, b) =>
        a.num - b.num || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name),
    );
}
