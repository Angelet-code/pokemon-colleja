/**
 * A Pokémon as the bots reason about it: its (known or assumed) set plus its battle state.
 * Own Pokémon come from the request and the team; rivals from `BattleView` and the
 * opponent model. HP is always absolute here (rival HP is converted from %).
 */
import { type BoostId, championsStats, type PokemonSet, type SideId } from '@colleja/core';
import {
  type AbilityId,
  getItem,
  getSpecies,
  type ItemId,
  type MoveId,
  type SpeciesId,
  type StatTable,
} from '@colleja/data';

export interface Combatant {
  side: SideId;
  /** Current species (its Mega once evolved). */
  species: SpeciesId;
  /** Known set (own, or rival with Open Team Sheets) or assumed one. */
  set: PokemonSet;
  hp: number;
  maxhp: number;
  status: string | null;
  boosts: Partial<Record<BoostId, number>>;
  /** Current item (`undefined` once consumed or removed). */
  item: ItemId | undefined;
  ability: AbilityId;
  /** Moves it has (own) or is assumed to have (rival). */
  moves: MoveId[];
  stats: StatTable;
  /** Has not moved since entering the field (first-turn moves like Fake Out still work). */
  fresh?: boolean;
  /** Move it is locked into by a Choice item. */
  lockedMove?: MoveId;
}

export interface CombatantInit {
  side: SideId;
  set: PokemonSet;
  species?: SpeciesId;
  /** HP as a fraction of the max (0–1). Defaults to full. */
  hpFraction?: number;
  /** Absolute HP (own Pokémon). Takes precedence over `hpFraction`. */
  hp?: number;
  status?: string | null;
  boosts?: Partial<Record<BoostId, number>>;
  item?: ItemId | undefined;
  ability?: AbilityId;
  moves?: MoveId[];
  fresh?: boolean;
  lockedMove?: MoveId;
}

export function makeCombatant(init: CombatantInit): Combatant {
  const species = init.species ?? init.set.species;
  const stats = championsStats(init.set, { species });
  const hp =
    init.hp ??
    Math.max(init.hpFraction === 0 ? 0 : 1, Math.round(stats.hp * (init.hpFraction ?? 1)));
  return {
    side: init.side,
    species,
    set: init.set,
    hp,
    maxhp: stats.hp,
    status: init.status ?? null,
    boosts: init.boosts ?? {},
    item: 'item' in init ? init.item : init.set.item,
    ability: init.ability ?? init.set.ability,
    moves: init.moves ?? init.set.moves,
    stats,
    fresh: init.fresh ?? true,
    ...(init.lockedMove ? { lockedMove: init.lockedMove } : {}),
  };
}

export function hasChoiceItem(combatant: Pick<Combatant, 'item'>): boolean {
  return (
    combatant.item === 'choiceband' ||
    combatant.item === 'choicespecs' ||
    combatant.item === 'choicescarf'
  );
}

/** The Mega Evolution this set's item enables, if any. */
export function megaSpeciesOf(set: Pick<PokemonSet, 'species' | 'item'>): SpeciesId | null {
  if (!set.item) return null;
  const mega = getItem(set.item)?.megaEvolutions.find((entry) => entry.from === set.species);
  return mega?.to ?? null;
}

const megaCache = new WeakMap<Combatant, Combatant>();

/**
 * Same Pokémon after Mega Evolving: new species, stats and (fixed) ability. Memoised, so
 * damage estimates cached per combatant are reused.
 */
export function megaEvolved(combatant: Combatant): Combatant {
  const cached = megaCache.get(combatant);
  if (cached) return cached;
  const mega = megaSpeciesOf({ species: combatant.set.species, item: combatant.item });
  if (!mega) return combatant;
  const stats = championsStats(combatant.set, { species: mega });
  const evolved = {
    ...combatant,
    species: mega,
    stats,
    ability: getSpecies(mega)?.abilities[0] ?? combatant.ability,
  };
  megaCache.set(combatant, evolved);
  return evolved;
}

export function hpFraction(combatant: Combatant): number {
  return combatant.maxhp > 0 ? combatant.hp / combatant.maxhp : 0;
}

export function typesOf(combatant: Combatant): string[] {
  return getSpecies(combatant.species)?.types ?? [];
}

const BOOST_TABLE = [
  2 / 8,
  2 / 7,
  2 / 6,
  2 / 5,
  2 / 4,
  2 / 3,
  1,
  3 / 2,
  4 / 2,
  5 / 2,
  6 / 2,
  7 / 2,
  8 / 2,
];

export function boostMultiplier(stage: number | undefined): number {
  return BOOST_TABLE[Math.max(-6, Math.min(6, stage ?? 0)) + 6] ?? 1;
}

const WEATHER_SPEED: Record<string, string[]> = {
  swiftswim: ['raindance', 'primordialsea'],
  chlorophyll: ['sunnyday', 'desolateland'],
  sandrush: ['sandstorm'],
  slushrush: ['snowscape', 'snow', 'hail'],
};

/**
 * Speed used to predict turn order: stat × boosts, paralysis, Choice Scarf, Tailwind and
 * weather abilities. An estimate (no Unburden, Quick Feet…), good enough for the heuristics.
 */
export function effectiveSpeed(
  combatant: Combatant,
  options: { tailwind?: boolean; weather?: string | null } = {},
): number {
  let speed = combatant.stats.spe * boostMultiplier(combatant.boosts.spe);
  if (combatant.status === 'par') speed *= 0.5;
  if (combatant.item === 'choicescarf') speed *= 1.5;
  if (options.tailwind) speed *= 2;
  const weathers = WEATHER_SPEED[combatant.ability];
  if (weathers && options.weather && weathers.includes(options.weather)) speed *= 2;
  return Math.floor(speed);
}
