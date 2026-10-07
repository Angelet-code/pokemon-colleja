/**
 * Read-only access to the generated Pokémon Champions data (`../generated/*.json`).
 *
 * The JSON files are produced by `npm run data:build` (tools/data-pipeline) from the pinned
 * Showdown commit plus PokeAPI names, and are committed to git. This module has no Node or
 * Showdown dependencies, so it can be used from the browser.
 */
import abilitiesJson from '../generated/abilities.json' with { type: 'json' };
import formatsJson from '../generated/formats.json' with { type: 'json' };
import descriptionsEnJson from '../generated/i18n/en.descriptions.json' with { type: 'json' };
import namesEnJson from '../generated/i18n/en.json' with { type: 'json' };
import descriptionsEsJson from '../generated/i18n/es.descriptions.json' with { type: 'json' };
import namesEsJson from '../generated/i18n/es.json' with { type: 'json' };
import itemsJson from '../generated/items.json' with { type: 'json' };
import learnsetsJson from '../generated/learnsets.json' with { type: 'json' };
import metaJson from '../generated/meta.json' with { type: 'json' };
import movesJson from '../generated/moves.json' with { type: 'json' };
import naturesJson from '../generated/natures.json' with { type: 'json' };
import speciesJson from '../generated/species.json' with { type: 'json' };
import standardSetsJson from '../generated/standard-sets.json' with { type: 'json' };
import typechartJson from '../generated/typechart.json' with { type: 'json' };
import type {
  AbilityData,
  AbilityId,
  DataMeta,
  DescriptionKind,
  FormatData,
  GameMode,
  ItemData,
  ItemId,
  Locale,
  LocaleDescriptions,
  LocaleNames,
  MoveData,
  MoveId,
  NameKind,
  NatureData,
  NatureId,
  SpeciesData,
  SpeciesId,
  SpeciesKind,
  StandardSet,
  StandardSets,
  TypeChart,
  TypeName,
} from './types';

export * from './schema';

/** JSON imports are typed structurally by TypeScript; the generator guarantees these shapes. */
function typed<T>(json: unknown): T {
  return json as T;
}

const species = typed<Record<SpeciesId, SpeciesData>>(speciesJson);
const moves = typed<Record<MoveId, MoveData>>(movesJson);
const abilities = typed<Record<AbilityId, AbilityData>>(abilitiesJson);
const items = typed<Record<ItemId, ItemData>>(itemsJson);
const natures = typed<Record<NatureId, NatureData>>(naturesJson);
const learnsets = typed<Record<SpeciesId, MoveId[]>>(learnsetsJson);
const formats = typed<Record<GameMode, FormatData>>(formatsJson);
const standardSets = typed<StandardSets>(standardSetsJson);
const typechart = typed<TypeChart>(typechartJson);
const names = typed<Record<Locale, LocaleNames>>({ es: namesEsJson, en: namesEnJson });
const descriptions = typed<Record<Locale, LocaleDescriptions>>({
  es: descriptionsEsJson,
  en: descriptionsEnJson,
});

export const meta = typed<DataMeta>(metaJson);

// ── Species ────────────────────────────────────────────────────────────────

export function getSpecies(id: SpeciesId): SpeciesData | undefined {
  return species[id];
}

/** Species of the given kind (default: only those that can be picked in the teambuilder). */
export function listSpecies(kind: SpeciesKind | 'all' = 'standard'): SpeciesData[] {
  const all = Object.values(species);
  return kind === 'all' ? all : all.filter((entry) => entry.kind === kind);
}

// ── Moves, abilities, items, natures ──────────────────────────────────────

export function getMove(id: MoveId): MoveData | undefined {
  return moves[id];
}

export function listMoves(): MoveData[] {
  return Object.values(moves);
}

export function getAbility(id: AbilityId): AbilityData | undefined {
  return abilities[id];
}

export function listAbilities(): AbilityData[] {
  return Object.values(abilities);
}

export function getItem(id: ItemId): ItemData | undefined {
  return items[id];
}

export function listItems(): ItemData[] {
  return Object.values(items);
}

export function getNature(id: NatureId): NatureData | undefined {
  return natures[id];
}

export function listNatures(): NatureData[] {
  return Object.values(natures);
}

// ── Learnsets ──────────────────────────────────────────────────────────────

/** Moves a species can learn in Champions. Megas and battle-only formes use their base forme. */
export function getLearnset(id: SpeciesId): MoveId[] {
  const entry = species[id];
  const learnsetId = entry?.changesFrom ?? id;
  return learnsets[learnsetId] ?? [];
}

export function canLearn(speciesId: SpeciesId, moveId: MoveId): boolean {
  return getLearnset(speciesId).includes(moveId);
}

// ── Formats and standard sets ──────────────────────────────────────────────

export function getFormat(mode: GameMode): FormatData {
  return formats[mode];
}

/** Standard sets of a selectable species for a mode (Mega sets live under the base species). */
export function getStandardSets(id: SpeciesId, mode: GameMode): StandardSet[] {
  return standardSets[mode][id] ?? [];
}

export function listStandardSets(mode: GameMode): StandardSet[] {
  return Object.values(standardSets[mode]).flat();
}

// ── Types ──────────────────────────────────────────────────────────────────

export function listTypes(): TypeName[] {
  return typechart.types;
}

/** Damage multiplier of an attacking type against a (possibly dual-typed) defender. */
export function getTypeEffectiveness(attacking: TypeName, defending: readonly TypeName[]): number {
  return defending.reduce((total, type) => total * typechart.effectiveness[attacking][type], 1);
}

// ── Localisation ───────────────────────────────────────────────────────────

/** Localised display name. Falls back to English, then to the id itself. */
export function getName(kind: NameKind, id: string, locale: Locale = 'es'): string {
  return names[locale][kind][id] ?? names.en[kind][id] ?? id;
}

/** Localised description (Spanish: in-game text from PokeAPI; English: Showdown's summary). */
export function getDescription(
  kind: DescriptionKind,
  id: string,
  locale: Locale = 'es',
): string | undefined {
  return descriptions[locale][kind][id] ?? descriptions.en[kind][id];
}
