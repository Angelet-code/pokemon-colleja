import { toId } from '@colleja/data/schema';
import { POKEAPI_SPANISH } from '../config';
import { loadPokeApiCsv } from './source';

export interface Entity {
  id: number;
  identifier: string;
}

export interface PokemonEntity extends Entity {
  speciesId: number;
  isDefault: boolean;
}

export interface FormEntity extends Entity {
  pokemonId: number;
  isDefault: boolean;
}

type TextKind =
  | 'species'
  | 'forms'
  | 'moves'
  | 'abilities'
  | 'items'
  | 'natures'
  | 'types'
  | 'stats';
type FlavorKind = 'moves' | 'abilities' | 'items';

/** PokeAPI tables needed by the pipeline, indexed by Showdown-style id (`toId(identifier)`). */
export interface PokeApiTables {
  pokemon: Map<string, PokemonEntity>;
  pokemonById: Map<number, PokemonEntity>;
  defaultPokemonBySpecies: Map<number, PokemonEntity>;
  species: Map<string, Entity>;
  /** All forms (cosmetic ones included), by `toId(identifier)`. */
  forms: Map<string, FormEntity>;
  defaultFormByPokemon: Map<number, FormEntity>;
  moves: Map<string, Entity>;
  abilities: Map<string, Entity>;
  items: Map<string, Entity>;
  natures: Map<string, Entity>;
  types: Map<string, Entity>;
  stats: Map<string, Entity>;
  /**
   * Spanish names by PokeAPI numeric id. `forms` holds the form name, which is sometimes the
   * full name ("Mega-Charizard X", "Rotom Lavado") and sometimes just the form ("Forma Filo").
   */
  spanish: Record<TextKind, Map<number, string>>;
  /** Most recent Spanish in-game description by PokeAPI numeric id. */
  spanishFlavor: Record<FlavorKind, Map<number, string>>;
}

function indexEntities(rows: Record<string, string>[]): Map<string, Entity> {
  const index = new Map<string, Entity>();
  for (const row of rows) {
    const key = toId(row.identifier ?? '');
    if (!index.has(key)) index.set(key, { id: Number(row.id), identifier: row.identifier ?? '' });
  }
  return index;
}

function spanishTexts(
  rows: Record<string, string>[],
  idColumn: string,
  textColumn = 'name',
): Map<number, string> {
  const texts = new Map<number, string>();
  for (const row of rows) {
    const text = row[textColumn]?.trim();
    if (Number(row.local_language_id) === POKEAPI_SPANISH && text) {
      texts.set(Number(row[idColumn]), text);
    }
  }
  return texts;
}

function cleanFlavorText(text: string): string {
  return text
    .replace(/­/g, '')
    .replace(/[\s\f]+/g, ' ')
    .trim();
}

/** Picks, per entity, the Spanish flavor text of the most recent version group. */
function latestSpanishFlavor(
  rows: Record<string, string>[],
  idColumn: string,
  versionOrder: Map<number, number>,
): Map<number, string> {
  const best = new Map<number, { order: number; text: string }>();
  for (const row of rows) {
    if (Number(row.language_id) !== POKEAPI_SPANISH) continue;
    const id = Number(row[idColumn]);
    const order = versionOrder.get(Number(row.version_group_id)) ?? 0;
    const current = best.get(id);
    if (!current || order >= current.order) {
      best.set(id, { order, text: cleanFlavorText(row.flavor_text ?? '') });
    }
  }
  return new Map([...best].map(([id, { text }]) => [id, text]));
}

export async function loadPokeApiTables(): Promise<PokeApiTables> {
  const names = [
    'pokemon',
    'pokemon_species',
    'pokemon_forms',
    'pokemon_species_names',
    'pokemon_form_names',
    'moves',
    'move_names',
    'move_flavor_text',
    'abilities',
    'ability_names',
    'ability_flavor_text',
    'items',
    'item_names',
    'item_flavor_text',
    'natures',
    'nature_names',
    'types',
    'type_names',
    'stats',
    'stat_names',
    'version_groups',
  ] as const;
  const loaded = await Promise.all(names.map((name) => loadPokeApiCsv(name)));
  const t = Object.fromEntries(names.map((name, i) => [name, loaded[i] ?? []])) as Record<
    (typeof names)[number],
    Record<string, string>[]
  >;

  const pokemon = new Map<string, PokemonEntity>();
  const pokemonById = new Map<number, PokemonEntity>();
  const defaultPokemonBySpecies = new Map<number, PokemonEntity>();
  for (const row of t.pokemon) {
    const entity: PokemonEntity = {
      id: Number(row.id),
      identifier: row.identifier ?? '',
      speciesId: Number(row.species_id),
      isDefault: row.is_default === '1',
    };
    pokemon.set(toId(entity.identifier), entity);
    pokemonById.set(entity.id, entity);
    if (entity.isDefault) defaultPokemonBySpecies.set(entity.speciesId, entity);
  }

  const forms = new Map<string, FormEntity>();
  const defaultFormByPokemon = new Map<number, FormEntity>();
  for (const row of t.pokemon_forms) {
    const form: FormEntity = {
      id: Number(row.id),
      identifier: row.identifier ?? '',
      pokemonId: Number(row.pokemon_id),
      isDefault: row.is_default === '1',
    };
    if (!forms.has(toId(form.identifier))) forms.set(toId(form.identifier), form);
    if (form.isDefault) defaultFormByPokemon.set(form.pokemonId, form);
  }

  const versionOrder = new Map(t.version_groups.map((row) => [Number(row.id), Number(row.order)]));

  return {
    pokemon,
    pokemonById,
    defaultPokemonBySpecies,
    species: indexEntities(t.pokemon_species),
    forms,
    defaultFormByPokemon,
    moves: indexEntities(t.moves),
    abilities: indexEntities(t.abilities),
    items: indexEntities(t.items),
    natures: indexEntities(t.natures),
    types: indexEntities(t.types),
    stats: indexEntities(t.stats),
    spanish: {
      species: spanishTexts(t.pokemon_species_names, 'pokemon_species_id'),
      forms: spanishTexts(t.pokemon_form_names, 'pokemon_form_id', 'form_name'),
      moves: spanishTexts(t.move_names, 'move_id'),
      abilities: spanishTexts(t.ability_names, 'ability_id'),
      items: spanishTexts(t.item_names, 'item_id'),
      natures: spanishTexts(t.nature_names, 'nature_id'),
      types: spanishTexts(t.type_names, 'type_id'),
      stats: spanishTexts(t.stat_names, 'stat_id'),
    },
    spanishFlavor: {
      moves: latestSpanishFlavor(t.move_flavor_text, 'move_id', versionOrder),
      abilities: latestSpanishFlavor(t.ability_flavor_text, 'ability_id', versionOrder),
      items: latestSpanishFlavor(t.item_flavor_text, 'item_id', versionOrder),
    },
  };
}
