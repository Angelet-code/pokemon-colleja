import {
  type AbilityData,
  type DescriptionKind,
  type ItemData,
  type Locale,
  type LocaleDescriptions,
  type LocaleNames,
  type MoveData,
  type NameKind,
  type NatureData,
  type SpeciesData,
  STAT_IDS,
  type StatId,
  TYPE_NAMES,
  toId,
} from '@colleja/data/schema';
import { spanishSpeciesName } from './pokeapi/species-map';
import type { Entity, PokeApiTables, PokemonEntity } from './pokeapi/tables';
import type { ShowdownTexts } from './showdown/texts';
import { sortedRecord } from './util/json';

const ENGLISH_STATS: Record<StatId, string> = {
  hp: 'HP',
  atk: 'Attack',
  def: 'Defense',
  spa: 'Sp. Atk',
  spd: 'Sp. Def',
  spe: 'Speed',
};

/** PokeAPI stat identifiers (as ids) → our stat ids. */
const POKEAPI_STATS: Record<StatId, string> = {
  hp: 'hp',
  atk: 'attack',
  def: 'defense',
  spa: 'specialattack',
  spd: 'specialdefense',
  spe: 'speed',
};

export interface I18nInput {
  species: SpeciesData[];
  pokemonBySpecies: Map<string, PokemonEntity | null>;
  moves: MoveData[];
  abilities: AbilityData[];
  items: ItemData[];
  natures: NatureData[];
}

export interface I18nResult {
  names: Record<Locale, LocaleNames>;
  descriptions: Record<Locale, LocaleDescriptions>;
  /** Ids without an official Spanish name, per kind (English is used at runtime). */
  missing: Partial<Record<NameKind, string[]>>;
}

/** Spanish texts by Showdown id, looked up through a PokeAPI identifier index. */
function pokeApiTexts(
  ids: string[],
  index: Map<string, Entity>,
  texts: Map<number, string>,
  pokeapiKey: (id: string) => string = (id) => id,
): Map<string, string> {
  const found = new Map<string, string>();
  for (const id of ids) {
    const entity = index.get(pokeapiKey(id));
    const text = entity ? texts.get(entity.id) : undefined;
    if (text) found.set(id, text);
  }
  return found;
}

/**
 * Builds both locales:
 *  - English: names and mechanical short descriptions from Showdown (Champions-aware).
 *  - Spanish names: PokeAPI (official), then Showdown's Spanish translation as a fallback.
 *  - Spanish descriptions: PokeAPI in-game text, except for effects that Champions changed
 *    (mainline text would be wrong there, so the English Champions text is used instead).
 *
 * Spanish files only hold real translations; the runtime falls back to English for the rest.
 */
export function buildI18n(
  input: I18nInput,
  tables: PokeApiTables,
  texts: ShowdownTexts,
): I18nResult {
  const missing: Partial<Record<NameKind, string[]>> = {};
  const flagMissing = (kind: NameKind, id: string) => {
    missing[kind] = [...(missing[kind] ?? []), id];
  };

  const spanishNames = (
    kind: NameKind,
    ids: string[],
    fromPokeApi: Map<string, string>,
    fallback?: Map<string, string>,
  ): Record<string, string> => {
    const out: [string, string][] = [];
    for (const id of ids) {
      const name = fromPokeApi.get(id) ?? fallback?.get(id);
      if (name) out.push([id, name]);
      else flagMissing(kind, id);
    }
    return sortedRecord(out);
  };

  const speciesEs: [string, string][] = [];
  for (const species of input.species) {
    const pokemon = input.pokemonBySpecies.get(species.id) ?? null;
    const result = spanishSpeciesName(species, pokemon, tables);
    if (result) speciesEs.push([species.id, result.name]);
    if (!result || result.source === 'fallback') flagMissing('species', species.id);
  }

  const ids: Record<DescriptionKind, string[]> = {
    moves: input.moves.map((m) => m.id),
    abilities: input.abilities.map((a) => a.id),
    items: input.items.map((i) => i.id),
  };
  const natureIds = input.natures.map((n) => n.id);

  const es: LocaleNames = {
    species: sortedRecord(speciesEs),
    moves: spanishNames(
      'moves',
      ids.moves,
      pokeApiTexts(ids.moves, tables.moves, tables.spanish.moves),
      texts.spanishNames.moves,
    ),
    abilities: spanishNames(
      'abilities',
      ids.abilities,
      pokeApiTexts(ids.abilities, tables.abilities, tables.spanish.abilities),
      texts.spanishNames.abilities,
    ),
    items: spanishNames(
      'items',
      ids.items,
      pokeApiTexts(ids.items, tables.items, tables.spanish.items),
      texts.spanishNames.items,
    ),
    natures: spanishNames(
      'natures',
      natureIds,
      pokeApiTexts(natureIds, tables.natures, tables.spanish.natures),
    ),
    types: spanishNames(
      'types',
      [...TYPE_NAMES],
      pokeApiTexts([...TYPE_NAMES], tables.types, tables.spanish.types, toId),
    ),
    stats: spanishNames(
      'stats',
      [...STAT_IDS],
      pokeApiTexts(
        [...STAT_IDS],
        tables.stats,
        tables.spanish.stats,
        (id) => POKEAPI_STATS[id as StatId],
      ),
    ),
  };

  const en: LocaleNames = {
    species: sortedRecord(input.species.map((s) => [s.id, s.name])),
    moves: sortedRecord(input.moves.map((m) => [m.id, m.name])),
    abilities: sortedRecord(input.abilities.map((a) => [a.id, a.name])),
    items: sortedRecord(input.items.map((i) => [i.id, i.name])),
    natures: sortedRecord(input.natures.map((n) => [n.id, n.name])),
    types: Object.fromEntries(TYPE_NAMES.map((type) => [type, type])),
    stats: { ...ENGLISH_STATS },
  };

  const spanishDescriptions = (kind: DescriptionKind, index: Map<string, Entity>) =>
    sortedRecord(
      [...pokeApiTexts(ids[kind], index, tables.spanishFlavor[kind])].filter(
        ([id]) => !texts.championsSpecific[kind].has(id),
      ),
    );

  return {
    names: { es, en },
    descriptions: {
      es: {
        moves: spanishDescriptions('moves', tables.moves),
        abilities: spanishDescriptions('abilities', tables.abilities),
        items: spanishDescriptions('items', tables.items),
      },
      en: {
        moves: sortedRecord(Object.entries(texts.englishDescriptions.moves)),
        abilities: sortedRecord(Object.entries(texts.englishDescriptions.abilities)),
        items: sortedRecord(Object.entries(texts.englishDescriptions.items)),
      },
    },
    missing,
  };
}
