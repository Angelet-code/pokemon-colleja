/**
 * Shapes of the generated data files in `packages/data/generated/`.
 * Ids follow Showdown's convention: lowercase alphanumeric (`garchomp`, `raichualola`, `uturn`).
 */

export type SpeciesId = string;
export type MoveId = string;
export type AbilityId = string;
export type ItemId = string;
export type NatureId = string;

export const STAT_IDS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
export type StatId = (typeof STAT_IDS)[number];
export type StatTable = Record<StatId, number>;

export const TYPE_NAMES = [
  'Normal',
  'Fire',
  'Water',
  'Electric',
  'Grass',
  'Ice',
  'Fighting',
  'Poison',
  'Ground',
  'Flying',
  'Psychic',
  'Bug',
  'Rock',
  'Ghost',
  'Dragon',
  'Dark',
  'Steel',
  'Fairy',
] as const;
export type TypeName = (typeof TYPE_NAMES)[number];

export type GameMode = 'singles' | 'doubles';
export type Locale = 'es' | 'en';
export type MoveCategory = 'Physical' | 'Special' | 'Status';

/**
 * - `standard`: can be picked in the teambuilder.
 * - `mega`: Mega Evolution, reached in battle by holding its Mega Stone.
 * - `battle-only`: in-battle forme change (Aegislash-Blade, Palafin-Hero, Castform-Sunny…).
 */
export type SpeciesKind = 'standard' | 'mega' | 'battle-only';

export interface SpeciesData {
  id: SpeciesId;
  /** Showdown English name, e.g. `Raichu-Alola`. */
  name: string;
  /** National Pokédex number. */
  num: number;
  baseSpecies: SpeciesId;
  forme: string | null;
  types: TypeName[];
  baseStats: StatTable;
  bst: number;
  /** Abilities that can be chosen (in Champions any of them, hidden included). */
  abilities: AbilityId[];
  weightkg: number;
  /** Fixed gender, or `null` when both genders are possible. `N` = genderless. */
  gender: 'M' | 'F' | 'N' | null;
  kind: SpeciesKind;
  /** For megas and battle-only formes: the species it transforms from. */
  changesFrom: SpeciesId | null;
  /** Mega Stone required (megas only). */
  requiredItem: ItemId | null;
  /** Mega Evolutions available to this species. */
  megas: SpeciesId[];
  /** Purely visual variants (Vivillon patterns, Alcremie flavours…). */
  cosmeticFormes: string[];
  /** PokeAPI `pokemon` id, used for sprites. */
  pokeapiId: number | null;
}

export interface MoveData {
  id: MoveId;
  name: string;
  num: number;
  type: TypeName;
  category: MoveCategory;
  basePower: number;
  /** `true` = never misses. */
  accuracy: number | true;
  /** Effective max PP in Champions (8 / 12 / 16 / 20). */
  pp: number;
  priority: number;
  /** Showdown target type (`normal`, `allAdjacentFoes`, `self`…). */
  target: string;
  /** Showdown move flags that are set (`contact`, `protect`, `sound`, `punch`…). */
  flags: string[];
  critRatio: number;
  /** Highest chance (%) among secondary effects, if any. */
  secondaryChance: number | null;
  multihit: number | [number, number] | null;
  /** [numerator, denominator] of damage dealt healed back. */
  drain: [number, number] | null;
  /** [numerator, denominator] of damage dealt taken as recoil. */
  recoil: [number, number] | null;
  /** The user switches out after using it (U-turn, Parting Shot…). */
  selfSwitch: boolean;
}

export interface AbilityData {
  id: AbilityId;
  name: string;
  /** Showdown's competitive rating (−1 detrimental … 5 essential). */
  rating: number;
}

export type ItemCategory = 'mega-stone' | 'berry' | 'gem' | 'held';

export interface ItemData {
  id: ItemId;
  name: string;
  category: ItemCategory;
  /** Mega Evolutions this stone enables. */
  megaEvolutions: { from: SpeciesId; to: SpeciesId }[];
  /** PokeAPI item identifier, used for item sprites. */
  spriteId: string | null;
}

export interface NatureData {
  id: NatureId;
  name: string;
  plus: StatId | null;
  minus: StatId | null;
}

export interface TypeChart {
  types: TypeName[];
  /** `effectiveness[attacking][defending]` ∈ {0, 0.5, 1, 2}. */
  effectiveness: Record<TypeName, Record<TypeName, number>>;
}

export interface TimerSettings {
  /** Seconds each player starts with. */
  starting: number;
  /** Max seconds per turn. */
  maxPerTurn: number;
  /** Max seconds for the first turn (team preview). */
  maxFirstTurn: number;
}

export interface FormatData {
  mode: GameMode;
  /** Showdown format id used by the engine. */
  showdownId: string;
  name: string;
  teamSize: number;
  /** Pokémon picked after team preview (3 singles, 4 doubles). */
  pickedTeamSize: number;
  level: number;
  statPoints: { total: number; perStat: number };
  /** Human-readable rule names (clauses, team preview…). */
  rules: string[];
  timer: TimerSettings | null;
}

export interface StandardSet {
  /** Role from Showdown's random sets (e.g. `Fast Attacker`) or custom label from overrides. */
  role: string;
  /** Selectable species (base species for Mega sets). */
  species: SpeciesId;
  /** Mega the set is built around, if any. */
  mega: SpeciesId | null;
  item: ItemId | null;
  ability: AbilityId;
  nature: NatureId;
  statPoints: StatTable;
  moves: MoveId[];
  gender: 'M' | 'F' | null;
  source: 'showdown-random-sets' | 'override';
}

export type StandardSets = Record<GameMode, Record<SpeciesId, StandardSet[]>>;

export type NameKind = 'species' | 'moves' | 'abilities' | 'items' | 'natures' | 'types' | 'stats';
export type DescriptionKind = 'moves' | 'abilities' | 'items';

export type LocaleNames = Record<NameKind, Record<string, string>>;
export type LocaleDescriptions = Record<DescriptionKind, Record<string, string>>;

export interface DataMeta {
  regulation: string;
  showdown: { commit: string; date: string };
  pokeapi: { commit: string };
  counts: {
    species: number;
    speciesNums: number;
    megas: number;
    battleOnly: number;
    moves: number;
    abilities: number;
    items: number;
    megaStones: number;
    natures: number;
    standardSets: Record<GameMode, number>;
  };
  /** Entries without an official Spanish name (English is used as fallback). */
  missingSpanishNames: Partial<Record<NameKind, string[]>>;
}

// ── Battle text (log narration) ───────────────────────────────────────────

/** Tables of Showdown battle messages: `default` holds the generic templates and conditions. */
export type BattleTextTable = 'default' | 'moves' | 'abilities' | 'items';

/** Message templates of one effect, by field (`start`, `end`, `damage`, `activate`…). */
export type BattleTextEntry = Record<string, string>;

/**
 * Grammatical metadata for articles and agreement (Spanish): gender (`m`/`f`/`n`) followed by
 * countability (`s`/`p`/`u`), e.g. `fs`. `classified` is the counted form of an item name.
 */
export interface BattleTextGrammar {
  grammar: string;
  articleRule?: 'stressed-a';
  classified?: { name: string; grammar: string; articleRule?: 'stressed-a' };
}

/** Battle text of one locale. Missing Spanish keys fall back to English. */
export interface BattleTextData extends Record<BattleTextTable, Record<string, BattleTextEntry>> {
  /** Stat names as used inside battle messages (`características`, `Ataque`…). */
  stats: Record<string, string>;
  grammar: { items: Record<string, BattleTextGrammar>; stats: Record<string, string> };
}
