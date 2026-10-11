/**
 * What a team of six looks like as a whole (fase 15, ADR-0017): which archetypes it is built
 * around (Trick Room, Tailwind, weather, setup behind Fake Out or redirection), which members
 * set each one up and which ones profit, and how well a group or a lead pair keeps those pieces
 * together. A first approximation without simulating: it reads moves, abilities, types and
 * speeds. Pure and deterministic; rival members are read over the sets the bot considers, each
 * with its probability.
 */
import type {
  ArchetypeReading,
  PokemonSet,
  SideId,
  TeamArchetype,
  TeamReading,
} from '@colleja/core';
import { getMove, getSpecies, type MoveId, type TypeName } from '@colleja/data';
import { type Combatant, effectiveSpeed, makeCombatant } from './combatant';
import { REDIRECTION_MOVES, SETUP_MOVES } from './move-knowledge';
import { battleForm } from './situation';
import { combinations } from './team-selection';

export const TEAM_ARCHETYPES: readonly TeamArchetype[] = [
  'trickroom',
  'tailwind',
  'rain',
  'sun',
  'sand',
  'snow',
  'setup',
];

/** One member's part in an archetype: chances (0–1) that it sets it up and that it profits. */
export interface ArchetypeRole {
  setter: number;
  abuser: number;
}

export interface MemberRead {
  species: string;
  roles: Record<TeamArchetype, ArchetypeRole>;
}

/** A set the bot considers for a member, with its probability. */
export interface WeightedSet {
  set: PokemonSet;
  weight: number;
}

/** Below this speed (battle form, no field effects) an attacker profits from Trick Room. */
export const TRICK_ROOM_SPEED = 90;
/** From this speed an attacker profits from Tailwind (doubled, it outspeeds almost anyone)… */
export const TAILWIND_SPEED = 75;
/** …and from this one it is fast enough without it (it profits a little). */
const FAST_SPEED = 150;
const FAST_TAILWIND_SHARE = 0.3;
/** Share of an abuser for an attacker with a same-type attack boosted by the weather. */
const WEATHER_STAB_SHARE = 0.7;
/** Share of an abuser for a type that gets a defence boost in sand (Rock) or snow (Ice). */
const WEATHER_TYPE_SHARE = 0.5;
/** Share of a setter for Fake Out (it buys one turn; redirection covers several). */
const FAKE_OUT_SHARE = 0.4;

/**
 * Abusers each archetype needs to be complete. Trick Room and Tailwind last four turns: a
 * single sweeper does not make the most of them.
 */
const NEEDED_ABUSERS: Record<TeamArchetype, number> = {
  trickroom: 2,
  tailwind: 2,
  rain: 1,
  sun: 1,
  sand: 1,
  snow: 1,
  setup: 1,
};

/**
 * In a lead pair, what must start on the field: speed control is set on turn 1 and the rest
 * profit from the back; weather and setup need both pieces together.
 */
export const LEAD_SCOPE: Record<TeamArchetype, 'setter' | 'both'> = {
  trickroom: 'setter',
  tailwind: 'setter',
  rain: 'both',
  sun: 'both',
  sand: 'both',
  snow: 'both',
  setup: 'both',
};

const WEATHER_OF_ABILITY: Partial<Record<string, TeamArchetype>> = {
  drizzle: 'rain',
  drought: 'sun',
  sandstream: 'sand',
  snowwarning: 'snow',
};

/** Abilities that double speed (or power) in a weather: a full abuser. */
const WEATHER_ABILITIES: Partial<Record<TeamArchetype, readonly string[]>> = {
  rain: ['swiftswim'],
  sun: ['chlorophyll', 'solarpower'],
  sand: ['sandrush', 'sandforce'],
  snow: ['slushrush'],
};

/** Attack types boosted by a weather (same-type attackers profit). */
const WEATHER_ATTACK_TYPE: Partial<Record<TeamArchetype, TypeName>> = {
  rain: 'Water',
  sun: 'Fire',
};

/** Types with a defence boost in a weather. */
const WEATHER_DEFENCE_TYPE: Partial<Record<TeamArchetype, TypeName>> = {
  sand: 'Rock',
  snow: 'Ice',
};

/** Moves that only work, or work better, in a weather. */
const WEATHER_MOVES: Partial<Record<TeamArchetype, readonly MoveId[]>> = {
  rain: ['thunder', 'hurricane'],
  sun: ['solarbeam', 'solarblade'],
  snow: ['auroraveil', 'blizzard'],
};

/** Setup moves that boost an attacking stat or speed (a sweeper, not a wall). */
const SWEEP_SETUP = new Set<MoveId>(
  Object.entries(SETUP_MOVES)
    .filter(([, boosts]) => boosts.atk || boosts.spa || boosts.spe)
    .map(([move]) => move),
);

/** Reads each member over its weighted sets (own: one set; rival: the sets the bot considers). */
export function readMembers(
  side: SideId,
  members: readonly (readonly WeightedSet[])[],
): MemberRead[] {
  return members.map((sets) => {
    const total = sets.reduce((sum, entry) => sum + entry.weight, 0) || 1;
    const roles = Object.fromEntries(
      TEAM_ARCHETYPES.map((kind) => [kind, { setter: 0, abuser: 0 }]),
    ) as Record<TeamArchetype, ArchetypeRole>;
    for (const { set, weight } of sets) {
      const combatant = battleForm(makeCombatant({ side, set }));
      for (const kind of TEAM_ARCHETYPES) {
        const role = setRole(kind, combatant);
        roles[kind].setter += (role.setter * weight) / total;
        roles[kind].abuser += (role.abuser * weight) / total;
      }
    }
    return { species: sets[0]?.set.species ?? '', roles };
  });
}

/** One known set's part in an archetype (0–1 each). */
export function setRole(kind: TeamArchetype, combatant: Combatant): ArchetypeRole {
  const moves = combatant.moves;
  const attacker = isAttacker(combatant);
  const speed = effectiveSpeed(combatant);
  switch (kind) {
    case 'trickroom':
      return {
        setter: moves.includes('trickroom') ? 1 : 0,
        abuser: attacker && speed < TRICK_ROOM_SPEED ? 1 : 0,
      };
    case 'tailwind':
      return {
        setter: moves.includes('tailwind') ? 1 : 0,
        abuser:
          !attacker || speed < TAILWIND_SPEED ? 0 : speed >= FAST_SPEED ? FAST_TAILWIND_SHARE : 1,
      };
    case 'setup':
      return {
        setter: moves.some((move) => REDIRECTION_MOVES.has(move))
          ? 1
          : moves.includes('fakeout')
            ? FAKE_OUT_SHARE
            : 0,
        abuser: attacker && moves.some((move) => SWEEP_SETUP.has(move)) ? 1 : 0,
      };
    default:
      return {
        setter: WEATHER_OF_ABILITY[combatant.ability] === kind ? 1 : 0,
        abuser: weatherAbuser(kind, combatant, attacker),
      };
  }
}

function weatherAbuser(kind: TeamArchetype, combatant: Combatant, attacker: boolean): number {
  if (WEATHER_ABILITIES[kind]?.includes(combatant.ability)) return 1;
  const types = getSpecies(combatant.species)?.types ?? [];
  let share = 0;
  const attackType = WEATHER_ATTACK_TYPE[kind];
  if (
    attacker &&
    attackType &&
    types.includes(attackType) &&
    combatant.moves.some((move) => {
      const data = getMove(move);
      return data?.type === attackType && data.category !== 'Status';
    })
  ) {
    share = WEATHER_STAB_SHARE;
  }
  if (WEATHER_MOVES[kind]?.some((move) => combatant.moves.includes(move))) {
    share = Math.max(share, WEATHER_STAB_SHARE);
  }
  const defenceType = WEATHER_DEFENCE_TYPE[kind];
  if (defenceType && types.includes(defenceType)) share = Math.max(share, WEATHER_TYPE_SHARE);
  return share;
}

/** It attacks: two or more damaging moves. */
function isAttacker(combatant: Combatant): boolean {
  let attacks = 0;
  for (const move of combatant.moves) {
    const category = getMove(move)?.category;
    if (category === 'Physical' || category === 'Special') attacks++;
  }
  return attacks >= 2;
}

/**
 * How complete an archetype is (0–1): the chance that one of `setters` sets it up times the
 * share of the abusers it needs among `abusers` (a member never profits from its own setup).
 */
export function archetypeStrength(
  team: readonly MemberRead[],
  kind: TeamArchetype,
  setters: readonly number[],
  abusers: readonly number[],
): number {
  let none = 1;
  for (const index of setters) none *= 1 - (team[index]?.roles[kind].setter ?? 0);
  let abuse = 0;
  for (const index of abusers) {
    const role = team[index]?.roles[kind];
    if (role) abuse += role.abuser * (1 - role.setter);
  }
  return (1 - none) * Math.min(1, abuse / NEEDED_ABUSERS[kind]);
}

/** Points each archetype is worth when complete (0 = it does not count). */
export type ArchetypeValues = Record<TeamArchetype, number>;

/** How well a group keeps its archetypes together (sum of each one's strength × value). */
export function groupSynergy(
  team: readonly MemberRead[],
  group: readonly number[],
  values: ArchetypeValues,
): number {
  let total = 0;
  for (const kind of TEAM_ARCHETYPES) {
    const value = values[kind];
    if (value !== 0) total += value * archetypeStrength(team, kind, group, group);
  }
  return total;
}

/**
 * How well a lead pair starts the group's plan: speed control needs its setter on the field
 * (the abusers may wait behind); weather and setup need both pieces together.
 */
export function leadSynergy(
  team: readonly MemberRead[],
  leads: readonly number[],
  group: readonly number[],
  values: ArchetypeValues,
): number {
  let total = 0;
  for (const kind of TEAM_ARCHETYPES) {
    const value = values[kind];
    if (value === 0) continue;
    const abusers = LEAD_SCOPE[kind] === 'setter' ? group : leads;
    total += value * archetypeStrength(team, kind, leads, abusers);
  }
  return total;
}

/** Every archetype worth the same (the read of a team, not a decision). */
export const EVEN_VALUES: ArchetypeValues = {
  trickroom: 1,
  tailwind: 1,
  rain: 1,
  sun: 1,
  sand: 1,
  snow: 1,
  setup: 1,
};

/** No archetype counts (the decision as before fase 15). */
export const NO_VALUES: ArchetypeValues = {
  trickroom: 0,
  tailwind: 0,
  rain: 0,
  sun: 0,
  sand: 0,
  snow: 0,
  setup: 0,
};

/** From this strength an archetype is part of the reading. */
export const READ_STRENGTH = 0.4;
/** From this chance a member is named as a setter or an abuser. */
const NAMED_SHARE = 0.25;
/** Groups this close to the best synergy count as tied (the ranking decides). */
const SYNERGY_TIE = 0.05;

/**
 * A team as a whole: its archetypes, the group of `picked` that keeps them together best (ties
 * broken by `rankGroup`, e.g. its coverage) and, in doubles, the lead pair that starts that
 * plan best (ties broken by `rankMember`, e.g. its average duel).
 */
export function readTeam(
  team: readonly MemberRead[],
  picked: number,
  leadsPerSide: number,
  rankGroup: (group: readonly number[]) => number,
  rankMember: (member: number) => number,
): TeamReading {
  const all = team.map((_, index) => index);
  const archetypes = TEAM_ARCHETYPES.map((kind): ArchetypeReading => {
    const named = (share: (role: ArchetypeRole) => number) =>
      team.flatMap((member) => (share(member.roles[kind]) >= NAMED_SHARE ? [member.species] : []));
    return {
      kind,
      strength: Math.round(archetypeStrength(team, kind, all, all) * 100) / 100,
      setters: named((role) => role.setter),
      abusers: named((role) => role.abuser * (1 - role.setter)),
    };
  })
    .filter((reading) => reading.strength >= READ_STRENGTH)
    .sort((a, b) => b.strength - a.strength);
  if (archetypes.length === 0) return { archetypes };
  // Only the archetypes it has count for its group and its leads.
  const values = { ...NO_VALUES };
  for (const reading of archetypes) values[reading.kind] = 1;
  const groups = combinations(team.length, Math.min(picked, team.length)).map((members) => ({
    members,
    synergy: groupSynergy(team, members, values),
  }));
  const top = Math.max(...groups.map((entry) => entry.synergy));
  if (top < READ_STRENGTH) return { archetypes };
  const group = bestBy(
    groups.filter((entry) => entry.synergy >= top - SYNERGY_TIE),
    (entry) => rankGroup(entry.members),
  )?.members;
  if (!group) return { archetypes };
  const species = (members: readonly number[]) =>
    members.map((member) => team[member]?.species ?? '');
  const reading: TeamReading = { archetypes, group: species(group) };
  if (leadsPerSide < 2) return reading;
  const pairs = combinations(group.length, 2).map((pair) => {
    const leads = pair.map((index) => group[index] as number);
    return { leads, synergy: leadSynergy(team, leads, group, values) };
  });
  const best = Math.max(...pairs.map((entry) => entry.synergy));
  if (best <= 0) return reading;
  const leads = bestBy(
    pairs.filter((entry) => entry.synergy >= best - SYNERGY_TIE),
    (entry) => entry.leads.reduce((sum, member) => sum + rankMember(member), 0),
  )?.leads;
  return leads ? { ...reading, leads: species(leads) } : reading;
}

/** The entry with the highest value (the first one on ties). */
function bestBy<T>(entries: readonly T[], value: (entry: T) => number): T | undefined {
  let best: T | undefined;
  let bestValue = -Infinity;
  for (const entry of entries) {
    const current = value(entry);
    if (current > bestValue) {
      best = entry;
      bestValue = current;
    }
  }
  return best;
}
