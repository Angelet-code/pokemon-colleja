/**
 * Factors of a lead matchup (fase 21): the two leads of each side on the field at the start of
 * turn 1, with what each side knows. From `me`'s side, its own four (leads and back) and, of
 * the rival, its leads plus the rest of its team preview, each weighing its share of the slots
 * still unseen (like the positions of `position.ts`).
 *
 * Situations, never species or move names (like `features.ts`): speeds, damage with
 * `estimateDamage`, duels, the weather the leads set and the speed control they bring. Two
 * of them (`teamDuels`, `teamSpeed`) only depend on the groups, not on who leads: they are the
 * team matchup, so a model can tell what the leads add on top of it. Positive is good for
 * `me`; 0 is neutral.
 */
import { otherSide, type SideId } from '@colleja/core';
import { setRole } from '../analysis/team-read';
import { type FeatureInfo, firstTurnFlinch, PositionContext } from './features';
import type { Position, PositionMember } from './position';

/** Bump when a lead factor changes: lead positions are regenerated. */
export const LEAD_FEATURES_VERSION = 1;

export const LEAD_FEATURES = [
  {
    id: 'leadSpeed',
    label: 'Quién se mueve antes entre las dos salidas',
    reason: 'su salida se mueve antes que la tuya',
  },
  {
    id: 'leadKoFirst',
    label: 'Golpes que tumban antes de moverse entre las salidas (a favor menos en contra)',
    reason: 'su salida tumba antes de que la tuya se mueva',
  },
  {
    id: 'leadKo',
    label: 'Golpes que tumban entre las salidas (a favor menos en contra)',
    reason: 'su salida deja a la tuya a tiro de un golpe',
  },
  {
    id: 'leadDamage',
    label: 'Daño entre las salidas (hecho menos recibido)',
    reason: 'su salida hace más daño del que recibe',
  },
  {
    id: 'leadDuels',
    label: 'Duelos uno contra uno que gana su salida contra el equipo rival',
    reason: 'su salida gana más duelos uno contra uno contra tu equipo',
  },
  {
    id: 'backCover',
    label: 'Rivales de la salida a los que gana alguien de su banquillo',
    reason: 'tiene en el banquillo respuesta a tu salida',
  },
  {
    id: 'leadFakeOut',
    label: 'Sorpresa en la salida',
    reason: 'sale con Sorpresa',
  },
  {
    id: 'leadWeather',
    label: 'Clima que pone su salida',
    reason: 'su salida pone su clima',
  },
  {
    id: 'leadTrickRoom',
    label: 'Espacio Raro en la salida y cuánto le favorece',
    reason: 'sale con Espacio Raro y le favorece',
  },
  {
    id: 'leadTailwind',
    label: 'Viento Afín en la salida y cuánto le favorece',
    reason: 'sale con Viento Afín y le favorece',
  },
  {
    id: 'teamDuels',
    label: 'Duelos que gana su grupo contra el equipo rival (sin mirar la salida)',
    reason: 'su grupo gana más duelos contra el tuyo',
  },
  {
    id: 'teamSpeed',
    label: 'Quién es más rápido entre los grupos (sin mirar la salida)',
    reason: 'su grupo es más rápido que el tuyo',
  },
] as const satisfies readonly FeatureInfo[];

export type LeadFeatureId = (typeof LEAD_FEATURES)[number]['id'];

/** The factors that only depend on the groups (the team matchup). */
export const TEAM_MATCHUP_FEATURES: readonly LeadFeatureId[] = ['teamDuels', 'teamSpeed'];

/** The lead factors of `position` (a turn-1 lead position) from `me`'s side. Deterministic. */
export function extractLeadFeatures(position: Position, me: SideId): number[] {
  const foe = otherSide(me);
  const ctx = new PositionContext(position);
  const alive = (side: SideId) =>
    position.sides[side].members.filter(
      (member) => !member.fainted && member.combatant.hp > 0 && member.weight > 0,
    );
  const mine = alive(me);
  const theirs = alive(foe);
  const myLeads = mine.filter((member) => member.active);
  const theirLeads = theirs.filter((member) => member.active);
  const myBack = mine.filter((member) => !member.active);
  const theirBack = theirs.filter((member) => !member.active);
  const trickRoom = position.timers.trickRoom > 0;

  const values: Record<LeadFeatureId, number> = {
    leadSpeed: ctx.speedBalance(myLeads, theirLeads, trickRoom),
    leadKoFirst: ctx.kos(myLeads, theirLeads, true) - ctx.kos(theirLeads, myLeads, true),
    leadKo: ctx.kos(myLeads, theirLeads, false) - ctx.kos(theirLeads, myLeads, false),
    leadDamage: ctx.damage(myLeads, theirLeads) - ctx.damage(theirLeads, myLeads),
    leadDuels: duels(ctx, myLeads, theirs) - duels(ctx, theirLeads, mine),
    backCover: ctx.answers(myBack, theirLeads) - ctx.answers(theirBack, myLeads),
    leadFakeOut: fakeOutLeads(myLeads) - fakeOutLeads(theirLeads),
    leadWeather: weatherBy(myLeads, position) - weatherBy(theirLeads, position),
    leadTrickRoom: trickRoomEdge(position, mine, theirs) - trickRoomEdge(position, theirs, mine),
    leadTailwind:
      tailwindEdge(position, me, mine, theirs) - tailwindEdge(position, foe, theirs, mine),
    teamDuels: duels(ctx, mine, theirs) - duels(ctx, theirs, mine),
    teamSpeed: ctx.speedBalance(mine, theirs, false, true),
  };
  return LEAD_FEATURES.map((feature) => values[feature.id]);
}

/** Share of the (weighted) rivals each attacker beats one on one, added over the attackers. */
function duels(
  ctx: PositionContext,
  attackers: readonly PositionMember[],
  rivals: readonly PositionMember[],
): number {
  const total = rivals.reduce((sum, rival) => sum + rival.weight, 0);
  if (total <= 0) return 0;
  return attackers.reduce(
    (sum, attacker) =>
      sum +
      attacker.weight *
        (rivals.reduce(
          (won, rival) => won + (ctx.wins(attacker.combatant, rival.combatant) ? rival.weight : 0),
          0,
        ) /
          total),
    0,
  );
}

/** Leads with a first-turn flinching hit, recognised by its data (`features.ts`). */
function fakeOutLeads(leads: readonly PositionMember[]): number {
  return leads.filter((lead) => lead.combatant.moves.some(firstTurnFlinch)).length;
}

/** 1 if the weather on the field is one this side's leads set up. */
function weatherBy(leads: readonly PositionMember[], position: Position): number {
  const weather = position.field.weather;
  if (!weather) return 0;
  return leads.some((lead) => setRole(weatherKind(weather), lead.combatant).setter >= 0.5) ? 1 : 0;
}

function weatherKind(weather: string): 'rain' | 'sun' | 'sand' | 'snow' {
  switch (weather) {
    case 'RainDance':
    case 'PrimordialSea':
      return 'rain';
    case 'SunnyDay':
    case 'DesolateLand':
      return 'sun';
    case 'Sandstorm':
      return 'sand';
    default:
      return 'snow';
  }
}

/**
 * How much a side's leads can set Trick Room (its best setter's chance) times how much it turns
 * the speed of the groups in its favour (−2 to 2 share points).
 */
function trickRoomEdge(
  position: Position,
  mine: readonly PositionMember[],
  theirs: readonly PositionMember[],
): number {
  const setter = bestSetter(mine, 'trickroom');
  if (setter === 0) return 0;
  const ctx = new PositionContext(position);
  const gain =
    ctx.speedBalance(mine, theirs, true, true) - ctx.speedBalance(mine, theirs, false, true);
  return setter * Math.max(0, gain);
}

/** Like `trickRoomEdge` with Tailwind on this side. */
function tailwindEdge(
  position: Position,
  side: SideId,
  mine: readonly PositionMember[],
  theirs: readonly PositionMember[],
): number {
  const setter = bestSetter(mine, 'tailwind');
  if (setter === 0) return 0;
  const now = new PositionContext(position);
  const windy = new PositionContext({
    ...position,
    timers: { ...position.timers, tailwind: { ...position.timers.tailwind, [side]: 4 } },
  });
  const gain =
    windy.speedBalance(mine, theirs, false, true) - now.speedBalance(mine, theirs, false, true);
  return setter * Math.max(0, gain);
}

/** The best chance among the leads that they set up `kind`. */
function bestSetter(members: readonly PositionMember[], kind: 'trickroom' | 'tailwind'): number {
  return Math.max(
    0,
    ...members
      .filter((member) => member.active)
      .map((member) => setRole(kind, member.combatant).setter),
  );
}
