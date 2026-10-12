/**
 * Factors of a battle position (fase 17, ADR-0019): what the learned value weighs, described in
 * situations, never by species or move name. A species only enters through what it means in
 * that position (its speed, its damage, its types, the field), computed with `@colleja/data`
 * and `estimateDamage`: if an update changes its stats, the factors change with them and the
 * model still holds. Every factor is seen from one side (`me`): positive is good for it, and
 * 0 is neutral (both sides alike). Apt for the browser: the bot will use this same function.
 */
import { otherSide, type SideId } from '@colleja/core';
import { getMove } from '@colleja/data';
import { type Combatant, effectiveSpeed, hpFraction, weatherOf } from '../analysis/combatant';
import { estimateDamage } from '../analysis/damage';
import { canMegaEvolve, type Position, type PositionMember } from './position';
import { EFFECT_TURNS } from './timers';

/** Bump when a factor changes: positions extracted with another version are regenerated. */
export const FEATURES_VERSION = 1;

/** A factor: its id and what it means in game terms (Spanish, for the explanations). */
export interface FeatureInfo {
  id: string;
  label: string;
  /**
   * Why an option that is better on this factor was chosen, from the bot's side ("porque
   * así …"): game terms, never numbers (fase 19, checked explanations).
   */
  reason: string;
}

export const FEATURES = [
  {
    id: 'hp',
    label: 'PS que le quedan a cada equipo (contando los que no han salido)',
    reason: 'le quedan más PS',
  },
  { id: 'alive', label: 'Pokémon que siguen en pie', reason: 'le quedan más Pokémon en pie' },
  {
    id: 'fieldHp',
    label: 'PS de los que están en el campo',
    reason: 'los suyos en el campo quedan con más PS',
  },
  {
    id: 'fieldSpeed',
    label: 'Quién se mueve antes en el campo',
    reason: 'se mueve antes que los tuyos en el campo',
  },
  {
    id: 'teamSpeed',
    label: 'Quién es más rápido contando el banquillo',
    reason: 'es más rápido que tu equipo contando el banquillo',
  },
  {
    id: 'trickRoom',
    label: 'Turnos de Espacio Raro a favor',
    reason: 'el Espacio Raro le favorece más turnos',
  },
  {
    id: 'tailwind',
    label: 'Turnos de Viento Afín',
    reason: 'tiene más turnos de Viento Afín que tú',
  },
  { id: 'screens', label: 'Turnos de pantallas', reason: 'tiene más turnos de pantallas que tú' },
  { id: 'weather', label: 'Clima puesto por su equipo', reason: 'el clima que queda es el suyo' },
  {
    id: 'koFor',
    label: 'Rivales en el campo que puede tumbar de un golpe',
    reason: 'deja a más de los tuyos a tiro de un golpe',
  },
  {
    id: 'koAgainst',
    label: 'Suyos en el campo que el rival puede tumbar de un golpe',
    reason: 'deja a menos de los suyos a tiro de un golpe',
  },
  {
    id: 'koFirstFor',
    label: 'Rivales que tumba de un golpe antes de que se muevan',
    reason: 'puede tumbar a más de los tuyos antes de que se muevan',
  },
  {
    id: 'koFirstAgainst',
    label: 'Suyos que el rival tumba de un golpe antes de que se muevan',
    reason: 'menos de los suyos caen de un golpe antes de moverse',
  },
  {
    id: 'damageFor',
    label: 'Daño que hace en el campo',
    reason: 'hace más daño a los tuyos en el campo',
  },
  {
    id: 'damageAgainst',
    label: 'Daño que recibe en el campo',
    reason: 'recibe menos daño en el campo',
  },
  {
    id: 'answers',
    label: 'Rivales a los que alguien suyo gana en un duelo',
    reason: 'le quedan más duelos ganados uno contra uno',
  },
  {
    id: 'boosts',
    label: 'Mejoras de características en el campo',
    reason: 'queda con mejores cambios de características',
  },
  {
    id: 'status',
    label: 'Problemas de estado',
    reason: 'tu equipo queda con más problemas de estado',
  },
  { id: 'mega', label: 'Megaevolución aún disponible', reason: 'conserva la Megaevolución' },
  {
    id: 'fakeOut',
    label: 'Sorpresa disponible en el campo',
    reason: 'conserva Sorpresa en el campo',
  },
] as const satisfies readonly FeatureInfo[];

export type FeatureId = (typeof FEATURES)[number]['id'];

/** The factors in `FEATURES` order. */
export type FeatureVector = number[];

/** A one-hit KO counts from this chance (rolls × accuracy). */
const KO_CHANCE = 0.5;
/** Turns to KO beyond this count as "never" in a duel. */
const MAX_DUEL_TURNS = 8;
const BOOSTS = ['atk', 'def', 'spa', 'spd', 'spe'] as const;

/** The factors of `position` from `me`'s side. Deterministic. */
export function extractFeatures(position: Position, me: SideId): FeatureVector {
  const foe = otherSide(me);
  const ctx = new Context(position);
  const mine = position.sides[me];
  const theirs = position.sides[foe];
  const alive = (members: readonly PositionMember[]) =>
    members.filter((member) => !member.fainted && member.combatant.hp > 0);
  const myAlive = alive(mine.members);
  const theirAlive = alive(theirs.members);
  const myField = myAlive.filter((member) => member.active);
  const theirField = theirAlive.filter((member) => member.active);
  const sum = (members: readonly PositionMember[], f: (member: PositionMember) => number) =>
    members.reduce((total, member) => total + f(member), 0);
  const balance = (f: (members: readonly PositionMember[], side: SideId) => number) =>
    f(myAlive, me) - f(theirAlive, foe);

  const values: Record<FeatureId, number> = {
    hp: balance((members) => sum(members, (m) => m.weight * hpFraction(m.combatant))),
    alive: balance((members) => sum(members, (m) => m.weight)),
    fieldHp:
      sum(myField, (m) => hpFraction(m.combatant)) -
      sum(theirField, (m) => hpFraction(m.combatant)),
    fieldSpeed: ctx.speedBalance(myField, theirField, position.timers.trickRoom > 0),
    teamSpeed: ctx.speedBalance(myAlive, theirAlive, position.timers.trickRoom > 0, true),
    trickRoom:
      (position.timers.trickRoom / EFFECT_TURNS.trickroom) *
      ctx.speedBalance(myAlive, theirAlive, true, true),
    tailwind:
      (position.timers.tailwind[me] - position.timers.tailwind[foe]) / EFFECT_TURNS.tailwind,
    screens: (position.timers.screens[me] - position.timers.screens[foe]) / EFFECT_TURNS.reflect,
    weather: weatherSetBy(myAlive, position) - weatherSetBy(theirAlive, position),
    koFor: ctx.kos(myField, theirField, false),
    koAgainst: ctx.kos(theirField, myField, false),
    koFirstFor: ctx.kos(myField, theirField, true),
    koFirstAgainst: ctx.kos(theirField, myField, true),
    damageFor: ctx.damage(myField, theirField),
    damageAgainst: ctx.damage(theirField, myField),
    answers: ctx.answers(myAlive, theirAlive) - ctx.answers(theirAlive, myAlive),
    boosts: boostSum(myField) - boostSum(theirField),
    status: statused(theirAlive) - statused(myAlive),
    mega: Number(canMegaEvolve(mine)) - Number(canMegaEvolve(theirs)),
    fakeOut: fakeOuts(myField) - fakeOuts(theirField),
  };
  return FEATURES.map((feature) => values[feature.id]);
}

/** The factors as a record (for tests and explanations). */
export function featureRecord(vector: readonly number[]): Record<FeatureId, number> {
  return Object.fromEntries(FEATURES.map((feature, i) => [feature.id, vector[i] ?? 0])) as Record<
    FeatureId,
    number
  >;
}

/** Best hit of one combatant on another, and the speeds, computed once per position. */
class Context {
  private readonly hits = new Map<Combatant, Map<Combatant, Hit>>();

  constructor(private readonly position: Position) {}

  speed(combatant: Combatant): number {
    return effectiveSpeed(combatant, {
      tailwind: this.position.timers.tailwind[combatant.side] > 0,
      weather: this.position.field.weather,
    });
  }

  /** 1 if `a` moves before `b`, −1 after, 0 on a speed tie (Trick Room inverts). */
  order(a: Combatant, b: Combatant, trickRoom: boolean): number {
    const diff = this.speed(a) - this.speed(b);
    return Math.sign(trickRoom ? -diff : diff);
  }

  /**
   * Who moves first over every pair: the count on the field, or (`share`) the weighted share
   * over the whole teams (−1 to 1).
   */
  speedBalance(
    mine: readonly PositionMember[],
    theirs: readonly PositionMember[],
    trickRoom: boolean,
    share = false,
  ): number {
    let total = 0;
    let weights = 0;
    for (const a of mine) {
      for (const b of theirs) {
        const weight = a.weight * b.weight;
        total += weight * this.order(a.combatant, b.combatant, trickRoom);
        weights += weight;
      }
    }
    return share ? (weights > 0 ? total / weights : 0) : total;
  }

  hit(attacker: Combatant, defender: Combatant): Hit {
    let row = this.hits.get(attacker);
    if (!row) {
      row = new Map();
      this.hits.set(attacker, row);
    }
    let hit = row.get(defender);
    if (!hit) {
      hit = bestHit(attacker, defender, this.position);
      row.set(defender, hit);
    }
    return hit;
  }

  /** Defenders some attacker knocks out in one hit (`first`: before the defender moves). */
  kos(
    attackers: readonly PositionMember[],
    defenders: readonly PositionMember[],
    first: boolean,
  ): number {
    const trickRoom = this.position.timers.trickRoom > 0;
    return defenders.filter((defender) =>
      attackers.some(
        (attacker) =>
          this.hit(attacker.combatant, defender.combatant).ko >= KO_CHANCE &&
          (!first || this.order(attacker.combatant, defender.combatant, trickRoom) > 0),
      ),
    ).length;
  }

  /** Share of each defender's HP the best attacker takes in one hit, added up. */
  damage(attackers: readonly PositionMember[], defenders: readonly PositionMember[]): number {
    return defenders.reduce(
      (total, defender) =>
        total +
        Math.max(0, ...attackers.map((a) => this.hit(a.combatant, defender.combatant).share)),
      0,
    );
  }

  /**
   * Rivals that someone of `mine` beats one on one (weighted by how likely each one is in the
   * battle): a quick duel at their current HP, boosts and field.
   */
  answers(mine: readonly PositionMember[], theirs: readonly PositionMember[]): number {
    return theirs.reduce((total, rival) => {
      let unanswered = 1;
      for (const member of mine) {
        if (this.wins(member.combatant, rival.combatant)) unanswered *= 1 - member.weight;
      }
      return total + rival.weight * (1 - unanswered);
    }, 0);
  }

  /** `a` knocks `b` out first, trading best hits (the faster one wins a tie in turns). */
  wins(a: Combatant, b: Combatant): boolean {
    const mine = turnsToKo(this.hit(a, b));
    const theirs = turnsToKo(this.hit(b, a));
    if (mine > MAX_DUEL_TURNS) return false;
    if (mine !== theirs) return mine < theirs;
    return this.order(a, b, this.position.timers.trickRoom > 0) > 0;
  }
}

interface Hit {
  /** Expected share of the defender's current HP (0–1). */
  share: number;
  /** Chance of knocking it out in one hit (rolls × accuracy). */
  ko: number;
}

function bestHit(attacker: Combatant, defender: Combatant, position: Position): Hit {
  let best: Hit = { share: 0, ko: 0 };
  if (defender.hp <= 0) return best;
  for (const move of attacker.moves) {
    const data = getMove(move);
    if (!data || data.category === 'Status') continue;
    const estimate = estimateDamage(attacker, defender, move, position.field);
    const share = Math.min(1, (estimate.avg * estimate.accuracy) / defender.hp);
    const ko = estimate.koChance * estimate.accuracy;
    if (share > best.share || (share === best.share && ko > best.ko)) best = { share, ko };
  }
  return best;
}

function turnsToKo(hit: Hit): number {
  if (hit.ko >= KO_CHANCE) return 1;
  return hit.share > 0 ? Math.ceil(1 / hit.share) : Number.POSITIVE_INFINITY;
}

/** 1 if the current weather is one this side's Pokémon set up. */
function weatherSetBy(members: readonly PositionMember[], position: Position): number {
  const weather = position.field.weather;
  if (!weather) return 0;
  return members.some((member) => weatherOf(member.combatant) === weather) ? 1 : 0;
}

function boostSum(members: readonly PositionMember[]): number {
  return members.reduce(
    (total, member) =>
      total + BOOSTS.reduce((sum, stat) => sum + (member.combatant.boosts[stat] ?? 0), 0),
    0,
  );
}

function statused(members: readonly PositionMember[]): number {
  return members.reduce(
    (total, member) => total + (member.combatant.status ? member.weight : 0),
    0,
  );
}

/** Fresh Pokémon on the field with a first-turn flinching hit (Fake Out). */
function fakeOuts(members: readonly PositionMember[]): number {
  return members.filter((member) => member.fresh && member.combatant.moves.some(firstTurnFlinch))
    .length;
}

/**
 * By what the move does, not its name: top priority, a sure flinch and little power (Fake Out;
 * Upper Hand hits harder and only works against priority).
 */
function firstTurnFlinch(move: string): boolean {
  const data = getMove(move);
  return (
    data !== undefined &&
    data.category !== 'Status' &&
    data.priority >= 3 &&
    data.secondaryChance === 100 &&
    data.basePower <= 40
  );
}
