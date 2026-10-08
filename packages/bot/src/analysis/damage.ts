/**
 * Damage estimates with `@smogon/calc`, which supports Champions as generation 0 (Stat Points
 * are passed as `evs`). Translates our state (combatants + field) into calc objects.
 * Browser-safe: calc has no Node dependencies.
 */

import type { BattleView, SideId } from '@colleja/core';
import { getAbility, getItem, getMove, getNature, getSpecies, type MoveId } from '@colleja/data';
import { calculate, Field, Generations, Move, Pokemon, Side } from '@smogon/calc';
import type { Combatant } from './combatant';

const GEN = Generations.get(0);

type CalcPokemonOptions = NonNullable<ConstructorParameters<typeof Pokemon>[2]>;
type CalcFieldOptions = NonNullable<ConstructorParameters<typeof Field>[0]>;
type CalcSideOptions = NonNullable<ConstructorParameters<typeof Side>[0]>;
type CalcWeather = CalcFieldOptions['weather'];
type CalcTerrain = CalcFieldOptions['terrain'];

/** What the calc needs from the field, independent of who attacks. */
export interface FieldState {
  doubles: boolean;
  weather: string | null;
  terrain: string | null;
  pseudoWeather: readonly string[];
  /** Side conditions (`reflect`, `tailwind`…) of each side. */
  conditions: Record<SideId, Readonly<Record<string, number>>>;
  /**
   * One-turn effects on each side the calculator can set (`helpinghand` on the attacker's
   * side, `friendguard` on the defender's). Battles do not fill them.
   */
  boosts?: Partial<Record<SideId, readonly SideBoost[]>>;
}

/** One-turn effects of a side that change damage (calculator only). */
export type SideBoost = 'helpinghand' | 'friendguard';

/** Options of one damage estimate. */
export interface DamageOptions {
  /** The hit is a critical hit. */
  crit?: boolean;
}

export function fieldFromView(view: BattleView): FieldState {
  return {
    doubles: view.gameType === 'doubles',
    weather: view.field.weather,
    terrain: view.field.terrain,
    pseudoWeather: view.field.pseudoWeather,
    conditions: { p1: view.sides.p1.conditions, p2: view.sides.p2.conditions },
  };
}

export function emptyField(doubles: boolean): FieldState {
  return {
    doubles,
    weather: null,
    terrain: null,
    pseudoWeather: [],
    conditions: { p1: {}, p2: {} },
  };
}

export interface DamageEstimate {
  /** Damage rolls (16 normally), absolute HP. */
  rolls: number[];
  min: number;
  max: number;
  avg: number;
  /** Fraction of rolls that knock out the defender from its current HP (ignores accuracy). */
  koChance: number;
  /** Accuracy as a probability (1 for moves that never miss). */
  accuracy: number;
}

const NO_DAMAGE: DamageEstimate = { rolls: [0], min: 0, max: 0, avg: 0, koChance: 0, accuracy: 1 };

const WEATHERS: Record<string, CalcWeather> = {
  sunnyday: 'Sun',
  raindance: 'Rain',
  sandstorm: 'Sand',
  snowscape: 'Snow',
  snow: 'Snow',
  hail: 'Hail',
  desolateland: 'Harsh Sunshine',
  primordialsea: 'Heavy Rain',
  deltastream: 'Strong Winds',
};

const TERRAINS: Record<string, CalcTerrain> = {
  electricterrain: 'Electric',
  grassyterrain: 'Grassy',
  psychicterrain: 'Psychic',
  mistyterrain: 'Misty',
};

/** Calc names that differ from our species names (base formes the calc splits). */
const CALC_SPECIES: Record<string, string> = { aegislash: 'Aegislash-Shield' };

const STATUSES = new Set(['slp', 'psn', 'brn', 'frz', 'par', 'tox']);

function speciesName(id: string): string {
  return CALC_SPECIES[id] ?? getSpecies(id)?.name ?? id;
}

function toCalcSide(
  conditions: Readonly<Record<string, number>>,
  boosts: readonly SideBoost[] = [],
): Side {
  const options: CalcSideOptions = {
    isHelpingHand: boosts.includes('helpinghand'),
    isFriendGuard: boosts.includes('friendguard'),
    isReflect: 'reflect' in conditions,
    isLightScreen: 'lightscreen' in conditions,
    isAuroraVeil: 'auroraveil' in conditions,
    isTailwind: 'tailwind' in conditions,
    isSR: 'stealthrock' in conditions,
    spikes: conditions.spikes ?? 0,
  };
  return new Side(options);
}

/** Calc's Pokémon for a combatant. Cached per combatant object (they are immutable). */
const pokemonCache = new WeakMap<Combatant, Pokemon>();

export function toCalcPokemon(combatant: Combatant): Pokemon {
  const cached = pokemonCache.get(combatant);
  if (cached) return cached;
  const { set } = combatant;
  const options: CalcPokemonOptions = {
    level: 50,
    nature: (getNature(set.nature)?.name ?? 'Serious') as CalcPokemonOptions['nature'],
    evs: { ...set.statPoints },
    boosts: { ...combatant.boosts } as CalcPokemonOptions['boosts'],
    curHP: combatant.hp,
  };
  const ability = getAbility(combatant.ability)?.name;
  if (ability) options.ability = ability as CalcPokemonOptions['ability'];
  const item = combatant.item ? getItem(combatant.item)?.name : undefined;
  if (item) options.item = item as CalcPokemonOptions['item'];
  if (combatant.status && STATUSES.has(combatant.status)) {
    options.status = combatant.status as CalcPokemonOptions['status'];
  }
  const pokemon = new Pokemon(GEN, speciesName(combatant.species), options);
  pokemonCache.set(combatant, pokemon);
  return pokemon;
}

function toCalcField(field: FieldState, attacker: SideId, defender: SideId): Field {
  const options: CalcFieldOptions = {
    gameType: field.doubles ? 'Doubles' : 'Singles',
    isGravity: field.pseudoWeather.includes('gravity'),
    isMagicRoom: field.pseudoWeather.includes('magicroom'),
    isWonderRoom: field.pseudoWeather.includes('wonderroom'),
    attackerSide: toCalcSide(field.conditions[attacker], field.boosts?.[attacker]),
    defenderSide: toCalcSide(field.conditions[defender], field.boosts?.[defender]),
  };
  const weather = field.weather ? WEATHERS[field.weather] : undefined;
  if (weather) options.weather = weather;
  const terrain = field.terrain ? TERRAINS[field.terrain] : undefined;
  if (terrain) options.terrain = terrain;
  return new Field(options);
}

/** Flattens calc's damage (number, rolls, or per-hit rolls for multi-hit effects) into rolls. */
export function damageRolls(damage: number | number[] | number[][]): number[] {
  if (typeof damage === 'number') return [damage];
  const [first] = damage;
  if (first === undefined) return [0];
  if (typeof first === 'number') return damage as number[];
  const hits = damage as number[][];
  return (hits[0] ?? []).map((_, i) => hits.reduce((sum, hit) => sum + (hit[i] ?? 0), 0));
}

/**
 * Damage of `move` from `attacker` to `defender`. Status moves and unknown data return 0
 * (the bots must never crash because of a gap in the calc).
 */
export function estimateDamage(
  attacker: Combatant,
  defender: Combatant,
  moveId: MoveId,
  field: FieldState,
  options: DamageOptions = {},
): DamageEstimate {
  const move = getMove(moveId);
  if (!move || move.category === 'Status' || defender.hp <= 0) return NO_DAMAGE;
  const key = `${calcKey(attacker)}>${calcKey(defender)}|${moveId}${options.crit ? '!' : ''}|${fieldKey(field, attacker.side, defender.side)}`;
  const cached = estimateCache.get(key);
  if (cached) return cached;
  if (estimateCache.size >= MAX_CACHED_ESTIMATES) estimateCache.clear();
  const estimate = calculateEstimate(attacker, defender, move, field, options);
  estimateCache.set(key, estimate);
  return estimate;
}

/**
 * Estimates by content: the level 3 search values many positions where the same Pokémon
 * meet again (`calculate` dominates its cost). Pure function, so caching is safe.
 */
const estimateCache = new Map<string, DamageEstimate>();
const MAX_CACHED_ESTIMATES = 20_000;
const keyCache = new WeakMap<Combatant, string>();

/** Everything about a combatant that the calc reads. */
function calcKey(combatant: Combatant): string {
  let key = keyCache.get(combatant);
  if (key === undefined) {
    const { set, boosts } = combatant;
    const points = Object.values(set.statPoints).join(',');
    const stages = Object.entries(boosts)
      .map(([stat, stage]) => `${stat}${stage}`)
      .join(',');
    key = `${combatant.species}/${set.nature}/${points}/${stages}/${combatant.hp}/${combatant.ability}/${combatant.item ?? ''}/${combatant.status ?? ''}`;
    keyCache.set(combatant, key);
  }
  return key;
}

function fieldKey(field: FieldState, attacker: SideId, defender: SideId): string {
  const conditions = (side: SideId) =>
    [...Object.keys(field.conditions[side]), ...(field.boosts?.[side] ?? [])].join(',');
  const spikes = field.conditions[defender].spikes ?? 0;
  return `${field.doubles ? 'd' : 's'}/${field.weather ?? ''}/${field.terrain ?? ''}/${field.pseudoWeather.join(',')}/${conditions(attacker)}/${conditions(defender)}${spikes}`;
}

function calculateEstimate(
  attacker: Combatant,
  defender: Combatant,
  move: NonNullable<ReturnType<typeof getMove>>,
  field: FieldState,
  options: DamageOptions,
): DamageEstimate {
  const accuracy = move.accuracy === true ? 1 : move.accuracy / 100;
  try {
    const result = calculate(
      GEN,
      toCalcPokemon(attacker),
      toCalcPokemon(defender),
      new Move(GEN, move.name, options.crit ? { isCrit: true } : undefined),
      toCalcField(field, attacker.side, defender.side),
    );
    const rolls = damageRolls(result.damage);
    const min = Math.min(...rolls);
    const max = Math.max(...rolls);
    const avg = rolls.reduce((sum, roll) => sum + roll, 0) / rolls.length;
    const koChance = rolls.filter((roll) => roll >= defender.hp).length / rolls.length;
    return { rolls, min, max, avg, koChance, accuracy };
  } catch {
    return { ...NO_DAMAGE, accuracy };
  }
}

/** Expected share of the defender's max HP removed (0–1), capped at its current HP. */
export function expectedHpShare(estimate: DamageEstimate, defender: Combatant): number {
  if (defender.maxhp <= 0) return 0;
  return (Math.min(estimate.avg, defender.hp) / defender.maxhp) * estimate.accuracy;
}
