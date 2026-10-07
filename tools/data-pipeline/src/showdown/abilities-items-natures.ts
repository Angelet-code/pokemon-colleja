import type {
  AbilityData,
  ItemCategory,
  ItemData,
  NatureData,
  SpeciesData,
  StatId,
} from '@colleja/data/schema';
import { toID } from '@colleja/showdown';
import type { ShowdownContext } from './context';

/** Abilities of every legal species and forme (Mega abilities included). */
export function extractAbilities({ dex }: ShowdownContext, species: SpeciesData[]): AbilityData[] {
  const ids = new Set(species.flatMap((entry) => entry.abilities));
  return [...ids].sort().map((id) => {
    const ability = dex.abilities.get(id);
    return { id: ability.id, name: ability.name, rating: ability.rating };
  });
}

type DexItem = ReturnType<ShowdownContext['dex']['items']['get']>;

function itemCategory(item: DexItem): ItemCategory {
  if (item.megaStone) return 'mega-stone';
  if (item.isBerry) return 'berry';
  if (item.isGem) return 'gem';
  return 'held';
}

/** Held items legal in Champions (Mega Stones, berries and the Normal Gem included). */
export function extractItems({ dex }: ShowdownContext): ItemData[] {
  return dex.items
    .all()
    .filter((item) => item.exists && !item.isNonstandard)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((item) => ({
      id: item.id,
      name: item.name,
      category: itemCategory(item),
      megaEvolutions: Object.entries(item.megaStone ?? {}).map(([from, to]) => ({
        from: toID(from),
        to: toID(to),
      })),
      spriteId: null,
    }));
}

export function extractNatures({ dex }: ShowdownContext): NatureData[] {
  return [...dex.natures.all()]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((nature) => ({
      id: nature.id,
      name: nature.name,
      plus: (nature.plus as StatId | undefined) ?? null,
      minus: (nature.minus as StatId | undefined) ?? null,
    }));
}
