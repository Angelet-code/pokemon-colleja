/**
 * Which set each rival Pokémon probably has (phase 11, level 3): the opponent model's
 * candidates (standard sets that agree with what has been revealed) weighed by how well they
 * explain what the bot has observed — the damage of every hit and who moved first
 * (`observations.ts`) — plus the Item Clause. A uniform prior, like random teams; a set that
 * contradicts an observation keeps a small likelihood (effects the model misses). When no
 * candidate explains everything (a custom set), spread variants of the best one join in.
 */
import {
  type AgentContext,
  type BattleView,
  otherSide,
  type PokemonSet,
  type SideId,
  type ViewPokemon,
} from '@colleja/core';
import {
  getItem,
  getMove,
  getSpecies,
  type SpeciesId,
  STAT_IDS,
  type StatId,
  type StatTable,
} from '@colleja/data';
import {
  type Combatant,
  effectiveSpeed,
  makeCombatant,
  megaSpeciesOf,
} from '../analysis/combatant';
import { estimateDamage } from '../analysis/damage';
import type { OpponentModel } from '../analysis/opponent-model';
import { findOwnSet } from '../analysis/own-sets';
import {
  extractObservations,
  type HitObservation,
  type Observation,
  type OrderObservation,
  type Snapshot,
} from './observations';

/** A possible set of a rival and how likely it is (0–1; a rival's add up to 1). */
export interface SetHypothesis {
  set: PokemonSet;
  probability: number;
  /** A spread variant (custom set), not a standard set. */
  variant: boolean;
}

/** Likelihood kept by a set that contradicts one observation. */
export const CONTRADICTION_LIKELIHOOD = 0.05;
/**
 * Likelihood kept by a set with a Mega Stone each time the rival moved without Mega Evolving
 * while it could (players hardly ever keep a Mega waiting).
 */
export const UNUSED_MEGA_LIKELIHOOD = 0.2;
/** Prior of a spread variant relative to a standard set. */
const VARIANT_PRIOR = 0.2;
/** Hypotheses kept per rival. */
const MAX_HYPOTHESES = 8;

/** The bot's beliefs about the rival's sets, by base species. */
export class SetBeliefs {
  constructor(private readonly bySpecies: ReadonlyMap<SpeciesId, readonly SetHypothesis[]>) {}

  /** Hypotheses for a rival (by its base species), most likely first. */
  of(species: SpeciesId): readonly SetHypothesis[] | undefined {
    return this.bySpecies.get(baseOf(species));
  }

  entries(): [SpeciesId, readonly SetHypothesis[]][] {
    return [...this.bySpecies.entries()];
  }
}

/** Beliefs about every rival seen in battle or at team preview. */
export function inferBeliefs(
  context: AgentContext,
  view: BattleView,
  model: OpponentModel,
): SetBeliefs {
  const foe = otherSide(context.side);
  const side = view.sides[foe];
  const observations = extractObservations(context.log, foe);
  const own = (snapshot: Snapshot) => ownCombatant(context, snapshot);
  const map = new Map<SpeciesId, SetHypothesis[]>();

  // Item Clause: an item seen on one rival is not on another.
  const itemsSeen = new Map<SpeciesId, string>();
  for (const pokemon of side.pokemon) {
    if (pokemon.item) itemsSeen.set(pokemon.baseSpecies, pokemon.item);
  }
  const takenBy = (species: SpeciesId) =>
    new Set([...itemsSeen].filter(([owner]) => owner !== species).map(([, item]) => item));

  const rivals: { species: SpeciesId; revealed: Parameters<OpponentModel['candidates']>[0] }[] =
    side.pokemon.map((pokemon) => ({ species: pokemon.baseSpecies, revealed: pokemon }));
  const seen = new Set(rivals.map((rival) => speciesNum(rival.species)));
  for (const species of side.preview) {
    if (seen.has(speciesNum(species))) continue;
    rivals.push({ species, revealed: unrevealed(species) });
  }

  for (const { species, revealed } of rivals) {
    const taken = takenBy(species);
    let candidates = model.candidates(revealed);
    const allowed = candidates.filter((set) => !set.item || !taken.has(set.item));
    if (allowed.length > 0) candidates = allowed;
    const relevant = observations.filter((observation) => involves(observation, species, foe));
    const pokemon = 'ident' in revealed ? (revealed as ViewPokemon) : undefined;

    let hypotheses = candidates.map((set) => ({
      set,
      weight: likelihood(set, relevant, foe, own),
      variant: false,
    }));
    const best = hypotheses.reduce((top, h) => Math.max(top, h.weight), 0);
    if (relevant.length > 0 && best < 1 && model.knownSet(species) === undefined) {
      const base = hypotheses.find((h) => h.weight === best)?.set ?? candidates[0];
      if (base) {
        const itemOpen = pokemon?.item === undefined;
        hypotheses = hypotheses.concat(
          spreadVariants(base, itemOpen ? taken : null).map((set) => ({
            set,
            weight: VARIANT_PRIOR * likelihood(set, relevant, foe, own),
            variant: true,
          })),
        );
      }
    }
    const total = hypotheses.reduce((sum, h) => sum + h.weight, 0) || 1;
    map.set(
      baseOf(species),
      hypotheses
        .map(({ set, weight, variant }) => ({ set, probability: weight / total, variant }))
        // Stable: equally likely sets keep the model's order (the most offensive first).
        .sort((x, y) => y.probability - x.probability)
        .slice(0, MAX_HYPOTHESES),
    );
  }
  return new SetBeliefs(map);
}

function unrevealed(species: SpeciesId) {
  return {
    baseSpecies: species,
    species,
    item: undefined,
    ability: undefined,
    moves: [],
    megaEvolved: false,
  };
}

function involves(observation: Observation, species: SpeciesId, foe: SideId): boolean {
  const [x, y] =
    observation.kind === 'hit'
      ? [observation.attacker, observation.defender]
      : observation.kind === 'order'
        ? [observation.first, observation.second]
        : [observation.pokemon, observation.pokemon];
  return [x, y].some((snapshot) => snapshot.side === foe && sameSpecies(snapshot, species));
}

/** Product of the likelihoods of the observations involving this rival, if it had `set`. */
export function likelihood(
  set: PokemonSet,
  observations: readonly Observation[],
  foe: SideId,
  own: (snapshot: Snapshot) => Combatant | null,
): number {
  let value = 1;
  // Several moves in one battle without Mega Evolving say about as much as one.
  if (observations.some((o) => o.kind === 'nomega') && megaSpeciesOf(set)) {
    value *= UNUSED_MEGA_LIKELIHOOD;
  }
  for (const observation of observations) {
    if (observation.kind === 'nomega') continue;
    const consistent =
      observation.kind === 'hit'
        ? hitConsistent(observation, set, foe, own)
        : orderConsistent(observation, set, foe, own);
    if (!consistent) value *= CONTRADICTION_LIKELIHOOD;
  }
  return value;
}

/** Whether some damage roll explains the hit (with the rounding of the rival's %). */
function hitConsistent(
  hit: HitObservation,
  set: PokemonSet,
  foe: SideId,
  own: (snapshot: Snapshot) => Combatant | null,
): boolean {
  const foeAttacks = hit.attacker.side === foe;
  const ownPokemon = own(foeAttacks ? hit.defender : hit.attacker);
  if (!ownPokemon) return true;
  const rival = rivalCombatant(foeAttacks ? hit.attacker : hit.defender, set);
  const [attacker, defender] = foeAttacks ? [rival, ownPokemon] : [ownPokemon, rival];
  const singleTarget = !hit.spread && hit.field.doubles && isSpreadMove(hit.move);
  const field = singleTarget ? { ...hit.field, doubles: false } : hit.field;
  const estimate = estimateDamage(attacker, defender, hit.move, field, { crit: hit.crit });
  // A gap in the calc (or a missed immunity) proves nothing.
  if (estimate.max <= 0) return true;
  const low = estimate.min - 1;
  const high = estimate.max + 1;
  if (!foeAttacks) {
    // Rival HP is shown as floor(100 · hp / max) (at least 1 while alive).
    const before = hpRange(hit.defender.hp, defender.maxhp);
    const after = hit.atLeast ? ([0, 0] as const) : hpRange(hit.hpAfter, defender.maxhp);
    const lost: [number, number] = [before[0] - after[1], before[1] - after[0]];
    if (hit.atLeast) return high >= lost[0];
    return high >= lost[0] && low <= lost[1];
  }
  const lost = hit.defender.hp - hit.hpAfter;
  return hit.atLeast ? high >= lost : low <= lost && lost <= high;
}

/** Whether the turn order fits the speeds (ties fit either way). */
function orderConsistent(
  order: OrderObservation,
  set: PokemonSet,
  foe: SideId,
  own: (snapshot: Snapshot) => Combatant | null,
): boolean {
  const speedOf = (snapshot: Snapshot): number | null => {
    const combatant = snapshot.side === foe ? rivalCombatant(snapshot, set) : own(snapshot);
    if (!combatant) return null;
    return effectiveSpeed(combatant, {
      tailwind: 'tailwind' in order.field.conditions[snapshot.side],
      weather: order.field.weather,
    });
  };
  const first = speedOf(order.first);
  const second = speedOf(order.second);
  if (first === null || second === null || first === second) return true;
  const trickRoom = order.field.pseudoWeather.includes('trickroom');
  return trickRoom ? first < second : first > second;
}

/** HP range (absolute) behind a rival's shown %. */
function hpRange(percent: number, maxhp: number): [number, number] {
  if (percent >= 100) return [maxhp, maxhp];
  if (percent <= 0) return [0, 0];
  const low = percent === 1 ? 1 : Math.ceil((percent * maxhp) / 100);
  const high = Math.min(maxhp - 1, Math.ceil(((percent + 1) * maxhp) / 100) - 1);
  return [low, Math.max(low, high)];
}

/** The rival as it was at the observation, if it had `set`. */
function rivalCombatant(snapshot: Snapshot, set: PokemonSet): Combatant {
  return makeCombatant({
    side: snapshot.side,
    set,
    species: snapshot.species,
    hpFraction: snapshot.hp / (snapshot.maxhp || 100),
    status: snapshot.status,
    boosts: snapshot.boosts,
    item: snapshot.item === undefined ? set.item : (snapshot.item ?? undefined),
    ability: snapshot.ability ?? megaAbility(snapshot, set) ?? set.ability,
  });
}

/** One of the bot's own Pokémon as it was at the observation. */
export function ownCombatant(context: AgentContext, snapshot: Snapshot): Combatant | null {
  const set = findOwnSet(context.team, snapshot.ident, snapshot.species);
  if (!set) return null;
  return makeCombatant({
    side: snapshot.side,
    set,
    species: snapshot.species,
    hp: snapshot.hp,
    status: snapshot.status,
    boosts: snapshot.boosts,
    item: snapshot.item === undefined ? set.item : (snapshot.item ?? undefined),
    ability: snapshot.ability ?? megaAbility(snapshot, set) ?? set.ability,
  });
}

/** The fixed ability of a Mega (`undefined` if it has not Mega Evolved). */
function megaAbility(snapshot: Snapshot, set: PokemonSet): string | undefined {
  return snapshot.species !== set.species && getSpecies(snapshot.species)?.kind === 'mega'
    ? getSpecies(snapshot.species)?.abilities[0]
    : undefined;
}

/** Nature raising `plus` (key) and lowering the unused attacking stat, by attacking stat. */
const NATURES: Partial<Record<StatId, Record<'atk' | 'spa', string>>> = {
  atk: { atk: 'adamant', spa: 'adamant' },
  spa: { atk: 'modest', spa: 'modest' },
  spe: { atk: 'jolly', spa: 'timid' },
  def: { atk: 'impish', spa: 'bold' },
  spd: { atk: 'careful', spa: 'calm' },
};

/**
 * Alternative spreads of `base` for custom sets: all-out attack, fast, bulky attacker,
 * physically and specially defensive and, if its item is unknown (`takenItems` not `null`:
 * the items other rivals already show), Choice Scarf (Champions has no Band or Specs).
 * Variants equal to `base` are left out.
 */
export function spreadVariants(
  base: PokemonSet,
  takenItems: ReadonlySet<string> | null,
): PokemonSet[] {
  const attack = attackStat(base);
  const spread = (points: Partial<StatTable>): StatTable => ({
    hp: 0,
    atk: 0,
    def: 0,
    spa: 0,
    spd: 0,
    spe: 0,
    ...points,
  });
  const nature = (plus: StatId) => (NATURES[plus] as Record<'atk' | 'spa', string>)[attack];
  const variant = (statPoints: StatTable, plus: StatId, item?: string): PokemonSet => {
    const { item: baseItem, ...rest } = base;
    const held = item ?? baseItem;
    return { ...rest, ...(held ? { item: held } : {}), nature: nature(plus), statPoints };
  };
  const fast = spread({ hp: 2, [attack]: 32, spe: 32 });
  const variants = [
    variant(fast, attack),
    variant(fast, 'spe'),
    variant(spread({ hp: 32, [attack]: 32, def: 2 }), attack),
    variant(spread({ hp: 32, def: 32, [attack]: 2 }), 'def'),
    variant(spread({ hp: 32, spd: 32, [attack]: 2 }), 'spd'),
  ];
  if (takenItems && !takenItems.has('choicescarf') && getItem('choicescarf')) {
    variants.push(variant(fast, 'spe', 'choicescarf'));
  }
  const same = (set: PokemonSet) =>
    set.nature === base.nature &&
    set.item === base.item &&
    STAT_IDS.every((stat) => set.statPoints[stat] === base.statPoints[stat]);
  return variants.filter((set) => !same(set));
}

function attackStat(set: PokemonSet): 'atk' | 'spa' {
  if (set.statPoints.atk !== set.statPoints.spa) {
    return set.statPoints.atk > set.statPoints.spa ? 'atk' : 'spa';
  }
  const base = getSpecies(set.species)?.baseStats;
  return base && base.spa > base.atk ? 'spa' : 'atk';
}

const SPREAD_TARGETS = new Set(['allAdjacent', 'allAdjacentFoes']);

function isSpreadMove(move: string): boolean {
  return SPREAD_TARGETS.has(getMove(move)?.target ?? '');
}

function sameSpecies(snapshot: Snapshot, species: SpeciesId): boolean {
  return baseOf(snapshot.baseSpecies) === baseOf(species);
}

function baseOf(species: SpeciesId): SpeciesId {
  const data = getSpecies(species);
  return data?.changesFrom ?? data?.id ?? species;
}

function speciesNum(species: SpeciesId): number {
  return getSpecies(species)?.num ?? -1;
}
