import { type SpeciesData, toId } from '@colleja/data/schema';
import type { FormEntity, PokeApiTables, PokemonEntity } from './tables';

/**
 * Showdown species whose PokeAPI `pokemon` identifier can't be found automatically.
 * Base formes whose PokeAPI default has a suffix (aegislash-shield, gourgeist-average…) and
 * cosmetic formes (vivillon-fancy…) are resolved without an entry here.
 */
export const POKEAPI_POKEMON_ALIASES: Readonly<Record<string, string>> = {
  basculegionf: 'basculegion-female',
  indeedeef: 'indeedee-female',
  maushold: 'maushold-family-of-three',
  mausholdfour: 'maushold-family-of-four',
  meowsticf: 'meowstic-female',
  meowsticmmega: 'meowstic-male-mega',
  meowsticfmega: 'meowstic-female-mega',
  squawkabillyblue: 'squawkabilly-blue-plumage',
  squawkabillyyellow: 'squawkabilly-yellow-plumage',
  squawkabillywhite: 'squawkabilly-white-plumage',
  taurospaldeacombat: 'tauros-paldea-combat-breed',
  taurospaldeablaze: 'tauros-paldea-blaze-breed',
  taurospaldeaaqua: 'tauros-paldea-aqua-breed',
};

/** Official Spanish names of the Paldean Tauros breeds. */
const PALDEA_BREEDS: Readonly<Record<string, string>> = {
  Combat: 'Raza Combatiente',
  Blaze: 'Raza Ardiente',
  Aqua: 'Raza Acuática',
};

/** Finds the PokeAPI `pokemon` entry (sprites, form names) for a Showdown species. */
export function resolvePokeApiPokemon(
  species: SpeciesData,
  tables: PokeApiTables,
): PokemonEntity | null {
  const alias = POKEAPI_POKEMON_ALIASES[species.id];
  if (alias) return tables.pokemon.get(toId(alias)) ?? null;

  const exact = tables.pokemon.get(species.id);
  if (exact) return exact;

  // Cosmetic formes (vivillon-fancy, polteageist-antique…) are PokeAPI forms of a base Pokémon.
  const form = tables.forms.get(species.id);
  if (form) return tables.pokemonById.get(form.pokemonId) ?? null;

  if (!species.forme) {
    const pokeapiSpecies = tables.species.get(species.id);
    if (pokeapiSpecies) return tables.defaultPokemonBySpecies.get(pokeapiSpecies.id) ?? null;
  }
  return null;
}

function pokeApiForm(
  species: SpeciesData,
  pokemon: PokemonEntity | null,
  tables: PokeApiTables,
): FormEntity | undefined {
  return (
    tables.forms.get(species.id) ??
    (pokemon ? tables.defaultFormByPokemon.get(pokemon.id) : undefined)
  );
}

/**
 * Spanish name following the official naming conventions, for formes PokeAPI has no Spanish
 * text for yet (e.g. the Legends Z-A Megas): "Mega-Raichu X", "Tauros de Paldea (Raza Ardiente)".
 */
export function deriveSpanishFormeName(baseName: string, forme: string): string | null {
  const mega = /^Mega(?:-([XYZ]))?$/.exec(forme);
  if (mega) return `Mega-${baseName}${mega[1] ? ` ${mega[1]}` : ''}`;

  const genderedMega = /^([MF])-Mega$/.exec(forme);
  if (genderedMega) return `Mega-${baseName} ${genderedMega[1] === 'M' ? '♂' : '♀'}`;

  const regional = /^(Alola|Galar|Hisui|Paldea)(?:-(\w+))?$/.exec(forme);
  if (regional) {
    const [, region, variant] = regional;
    const breed = variant ? PALDEA_BREEDS[variant] : undefined;
    if (variant && !breed) return null;
    return `${baseName} de ${region}${breed ? ` (${breed})` : ''}`;
  }
  return null;
}

export type SpanishNameSource = 'official' | 'derived' | 'fallback';

/**
 * Spanish name of a species/forme:
 *  1. `official`: PokeAPI species name, or form name made into a full name
 *     ("Mega-Charizard X", "Rotom Lavado", "Forma de Alola" → "Raichu de Alola",
 *     "Forma Filo" → "Aegislash (Forma Filo)").
 *  2. `derived`: built from the official conventions (Megas, regional formes).
 *  3. `fallback`: "<Spanish base name> (<Showdown forme>)", to be reviewed via overrides.
 */
export function spanishSpeciesName(
  species: SpeciesData,
  pokemon: PokemonEntity | null,
  tables: PokeApiTables,
): { name: string; source: SpanishNameSource } | null {
  const base = tables.species.get(species.baseSpecies);
  const baseName = base ? tables.spanish.species.get(base.id) : undefined;
  if (!baseName) return null;
  if (!species.forme) return { name: baseName, source: 'official' };

  const form = pokeApiForm(species, pokemon, tables);
  const formName = form ? tables.spanish.forms.get(form.id) : undefined;
  if (formName) {
    if (formName.startsWith('Mega-') || formName.includes(baseName)) {
      return { name: formName, source: 'official' };
    }
    const region = /^Forma de (.+)$/.exec(formName);
    if (region) return { name: `${baseName} de ${region[1]}`, source: 'official' };
    return { name: `${baseName} (${formName})`, source: 'official' };
  }

  const derived = deriveSpanishFormeName(baseName, species.forme);
  if (derived) return { name: derived, source: 'derived' };
  return { name: `${baseName} (${species.forme})`, source: 'fallback' };
}
