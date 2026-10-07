/**
 * Expected-damage simulation of a doubles turn and its follow-up: the tactical bot tries a
 * pair of actions for its two slots on turn 1, then every Pokémon on the field uses its best
 * attack for a couple more turns (rivals choose like a damage-maximising player). The result
 * is the material balance (HP shares) — a principled way to value focus fire, Protect,
 * Fake Out, Helping Hand, redirection, speed control, screens, spread moves that hit the
 * ally, status moves and switches.
 */
import type { BoostId, SideId } from '@colleja/core';
import { getMove, type MoveId } from '@colleja/data';
import { type Combatant, effectiveSpeed, hasChoiceItem, megaEvolved, typesOf } from './combatant';
import { attackDamage, withBoosts, withStatus } from './duel';
import { KO_BONUS } from './evaluation';
import {
  FIRST_TURN_MOVES,
  PROTECT_MOVES,
  RECOVERY_MOVES,
  REDIRECTION_MOVES,
  SELF_KO_MOVES,
  SETUP_MOVES,
  STATUS_MOVES,
} from './move-knowledge';
import type { OwnMember, Situation } from './situation';

/** What one own slot does on turn 1. */
export interface SlotPlan {
  /** `auto`: the slot uses its best attack, like in the follow-up turns. */
  kind: 'move' | 'switch' | 'pass' | 'auto';
  move?: MoveId;
  /** Showdown target location: `+N` rival position N, `-N` own position N. */
  target?: number;
  mega?: boolean;
  /** Own member sent in (switches). */
  switchTo?: OwnMember;
  /** The status effect lands (for accuracy-weighted evaluation). Default true. */
  effectLands?: boolean;
}

interface Unit {
  side: 'mine' | 'foe';
  position: number;
  combatant: Combatant;
  hp: number;
  sleep: number;
  lock: MoveId | null;
  fresh: boolean;
  member: OwnMember | null;
  protect: boolean;
  flinch: boolean;
  helped: boolean;
}

interface Action {
  unit: Unit;
  move: MoveId | null;
  /** Explicit target location (`+N`/`-N`) or `undefined` for the move's default targets. */
  target: number | undefined;
  priority: number;
  plan: SlotPlan | null;
}

/** Turns simulated after turn 1. */
const FOLLOW_UP_TURNS = 2;
const SLEEP_TURNS = 2;
/** Doubles screens reduce damage to about two thirds. */
const SCREEN_FACTOR = 2 / 3;
const SINGLE_TARGETS = new Set(['normal', 'any', 'adjacentFoe', 'randomNormal']);

export class DoublesSim {
  private readonly units: Unit[];
  private readonly tailwind: Record<'mine' | 'foe', boolean>;
  private trickRoom: boolean;
  private readonly screens: Record<'mine' | 'foe', Set<string>>;
  private followMe: Record<'mine' | 'foe', Unit | null> = { mine: null, foe: null };

  constructor(private readonly situation: Situation) {
    const { field, me, foe } = situation;
    this.tailwind = {
      mine: 'tailwind' in field.conditions[me],
      foe: 'tailwind' in field.conditions[foe],
    };
    this.trickRoom = situation.trickRoom;
    this.screens = { mine: new Set(), foe: new Set() };
    this.units = [];
    for (let position = 0; position < 2; position++) {
      const member = situation.ownActive(position);
      if (member && !member.fainted) {
        this.units.push(this.unit('mine', position, member.combatant, member));
      }
      const rival = situation.foeAt(position);
      if (rival) this.units.push(this.unit('foe', position, rival.combatant, null));
    }
  }

  private unit(
    side: 'mine' | 'foe',
    position: number,
    combatant: Combatant,
    member: OwnMember | null,
  ): Unit {
    return {
      side,
      position,
      combatant,
      hp: combatant.hp,
      sleep: combatant.status === 'slp' ? SLEEP_TURNS : 0,
      lock: combatant.lockedMove ?? null,
      fresh: combatant.fresh === true,
      member,
      protect: false,
      flinch: false,
      helped: false,
    };
  }

  /** Material balance after playing `plans` (one per own slot) and the follow-up turns. */
  static evaluate(situation: Situation, plans: readonly SlotPlan[]): number {
    const sim = new DoublesSim(situation);
    return sim.run(plans);
  }

  private run(plans: readonly SlotPlan[]): number {
    const start = new Map(this.units.map((unit) => [unit, unit.hp] as const));
    this.turn(plans);
    for (let turn = 0; turn < FOLLOW_UP_TURNS && !this.decided(); turn++) this.turn(null);
    return this.value(start);
  }

  private decided(): boolean {
    const alive = (side: 'mine' | 'foe') => this.units.some((u) => u.side === side && u.hp > 0);
    return !alive('mine') || !alive('foe');
  }

  // ── One turn ───────────────────────────────────────────────────────────

  private turn(plans: readonly SlotPlan[] | null): void {
    // Rivals decide against the Pokémon on the field before any switch.
    const actions: Action[] = this.units
      .filter((unit) => unit.side === 'foe' && unit.hp > 0)
      .map((unit) => this.autoAction(unit));

    for (const unit of this.units.filter((u) => u.side === 'mine' && u.hp > 0)) {
      const plan = plans?.[unit.position];
      if (!plan || plan.kind === 'auto') {
        actions.push(this.autoAction(unit));
        continue;
      }
      if (plan.kind === 'switch' && plan.switchTo) {
        this.switchIn(unit, plan.switchTo);
        continue;
      }
      if (plan.kind === 'pass' || !plan.move) continue;
      if (plan.mega) unit.combatant = megaEvolved(unit.combatant);
      const move = getMove(plan.move);
      actions.push({
        unit,
        move: plan.move,
        target: plan.target,
        priority: move?.priority ?? 0,
        plan,
      });
    }

    // Protect, Helping Hand and redirection take effect before ordinary moves (high priority).
    for (const action of actions) {
      if (action.move && PROTECT_MOVES.has(action.move) && action.plan) action.unit.protect = true;
    }
    actions.sort((a, b) => b.priority - a.priority || this.speedOrder(a.unit, b.unit));
    for (const action of actions) this.execute(action);
    this.endOfTurn();
  }

  private switchIn(unit: Unit, member: OwnMember): void {
    unit.combatant = member.combatant;
    unit.hp = member.combatant.hp;
    unit.member = member;
    unit.sleep = member.combatant.status === 'slp' ? SLEEP_TURNS : 0;
    unit.lock = null;
    unit.fresh = true;
  }

  /** Negative when `a` moves first. Ties: rivals first (pessimistic). */
  private speedOrder(a: Unit, b: Unit): number {
    const speed = (unit: Unit) =>
      effectiveSpeed(unit.combatant, {
        tailwind: this.tailwind[unit.side],
        weather: this.situation.field.weather,
      });
    const difference = speed(b) - speed(a);
    if (difference !== 0) return this.trickRoom ? -difference : difference;
    return a.side === b.side ? 0 : a.side === 'foe' ? -1 : 1;
  }

  /** Best attack by expected damage value (+ KO bonus), like a damage-maximising player. */
  private autoAction(unit: Unit): Action {
    let best: Action = { unit, move: null, target: undefined, priority: 0, plan: null };
    let bestValue = 0;
    const moves = unit.lock ? [unit.lock] : unit.combatant.moves;
    for (const move of moves) {
      const data = getMove(move);
      if (!data || data.category === 'Status' || SELF_KO_MOVES.has(move)) continue;
      if (FIRST_TURN_MOVES.has(move) && !unit.fresh) continue;
      const targets: (number | undefined)[] = SINGLE_TARGETS.has(data.target)
        ? this.enemiesOf(unit).map((enemy) => enemy.position + 1)
        : [undefined];
      for (const target of targets) {
        const value = this.targets(unit, move, target).reduce((sum, defender) => {
          const sign = defender.side === unit.side ? -1 : 1;
          const damage = attackDamage(this.situation, unit.combatant, defender.combatant, move);
          const share = Math.min(damage, defender.hp) / Math.max(1, defender.combatant.maxhp);
          return sum + sign * (share * 100 + (damage >= defender.hp ? KO_BONUS : 0));
        }, 0);
        if (value > bestValue) {
          bestValue = value;
          best = { unit, move, target, priority: data.priority, plan: null };
        }
      }
    }
    return best;
  }

  private enemiesOf(unit: Unit): Unit[] {
    return this.units.filter((other) => other.side !== unit.side && other.hp > 0);
  }

  private allyOf(unit: Unit): Unit | undefined {
    return this.units.find((other) => other.side === unit.side && other !== unit && other.hp > 0);
  }

  /** Units a move hits, resolving fainted targets and redirection like Showdown. */
  private targets(unit: Unit, move: MoveId, target: number | undefined): Unit[] {
    const data = getMove(move);
    const enemies = this.enemiesOf(unit);
    if (!data) return [];
    if (data.target === 'allAdjacentFoes') return enemies;
    if (data.target === 'allAdjacent') {
      const ally = this.allyOf(unit);
      return ally ? [...enemies, ally] : enemies;
    }
    if (!SINGLE_TARGETS.has(data.target)) return [];
    if (target !== undefined && target < 0) {
      const ally = this.units.find((u) => u.side === unit.side && u.position === -target - 1);
      return ally && ally !== unit && ally.hp > 0 ? [ally] : [];
    }
    const redirect = this.followMe[unit.side === 'mine' ? 'foe' : 'mine'];
    if (redirect && redirect.hp > 0) return [redirect];
    const aimed = enemies.find((enemy) => target !== undefined && enemy.position === target - 1);
    const fallback = aimed ?? enemies[0];
    return fallback ? [fallback] : [];
  }

  private execute(action: Action): void {
    const { unit, move, plan } = action;
    if (unit.hp <= 0 || unit.flinch || unit.sleep > 0 || !move) return;
    const data = getMove(move);
    if (!data) return;
    if (data.category === 'Status') {
      if (plan) this.statusEffect(unit, move, action.target, plan);
      unit.fresh = false;
      return;
    }
    for (const defender of this.targets(unit, move, action.target)) {
      if (defender.protect) continue;
      let damage = attackDamage(this.situation, unit.combatant, defender.combatant, move);
      if (unit.helped) damage *= 1.5;
      const screen = data.category === 'Physical' ? 'reflect' : 'lightscreen';
      const screens = this.screens[defender.side];
      if (screens.has(screen) || screens.has('auroraveil')) damage *= SCREEN_FACTOR;
      const dealt = Math.min(damage, Math.max(0, defender.hp));
      defender.hp -= dealt;
      if (data.drain) unit.hp += (dealt * data.drain[0]) / data.drain[1];
      if (data.recoil) unit.hp -= (dealt * data.recoil[0]) / data.recoil[1];
      if (
        move === 'fakeout' &&
        unit.fresh &&
        defender.combatant.ability !== 'innerfocus' &&
        damage > 0
      ) {
        defender.flinch = true;
      }
      const status = STATUS_MOVES[move];
      if (status && plan?.effectLands !== false && !defender.combatant.status) {
        defender.combatant = withStatus(defender.combatant, status);
      }
    }
    if (unit.combatant.item === 'lifeorb') unit.hp -= unit.combatant.maxhp / 10;
    if (hasChoiceItem(unit.combatant)) unit.lock = move;
    unit.fresh = false;
  }

  /** Effects of own status moves on turn 1 (rivals' status moves are not modelled). */
  private statusEffect(unit: Unit, move: MoveId, target: number | undefined, plan: SlotPlan): void {
    const side = unit.side;
    const boosts: Partial<Record<BoostId, number>> | undefined = SETUP_MOVES[move];
    const status = STATUS_MOVES[move];
    if (boosts && !(move === 'curse' && typesOf(unit.combatant).includes('Ghost'))) {
      unit.combatant = withBoosts(unit.combatant, boosts);
    } else if (status) {
      if (plan.effectLands === false) return;
      for (const defender of this.statusTargets(unit, move, target)) {
        if (!defender.combatant.status && !defender.protect) {
          defender.combatant = withStatus(defender.combatant, status);
          if (status === 'slp') defender.sleep = SLEEP_TURNS + 1;
        }
      }
    } else if (RECOVERY_MOVES.has(move)) {
      unit.hp = Math.min(unit.combatant.maxhp, unit.hp + unit.combatant.maxhp / 2);
    } else if (move === 'tailwind') {
      this.tailwind[side] = true;
    } else if (move === 'trickroom') {
      this.trickRoom = !this.trickRoom;
    } else if (move === 'helpinghand') {
      const ally = this.allyOf(unit);
      if (ally) ally.helped = true;
    } else if (REDIRECTION_MOVES.has(move)) {
      this.followMe[side] = unit;
    } else if (move === 'reflect' || move === 'lightscreen' || move === 'auroraveil') {
      this.screens[side].add(move);
    }
  }

  private statusTargets(unit: Unit, move: MoveId, target: number | undefined): Unit[] {
    const data = getMove(move);
    if (!data) return [];
    if (data.target === 'allAdjacentFoes' || data.target === 'allAdjacent')
      return this.enemiesOf(unit);
    const enemies = this.enemiesOf(unit);
    const aimed = enemies.find((enemy) => target !== undefined && enemy.position === target - 1);
    const fallback = aimed ?? enemies[0];
    return fallback ? [fallback] : [];
  }

  private endOfTurn(): void {
    for (const unit of this.units) {
      if (unit.hp > 0) {
        const { maxhp, status, item } = unit.combatant;
        if (status === 'brn') unit.hp -= maxhp / 16;
        if (status === 'psn' || status === 'tox') unit.hp -= maxhp / 8;
        if (item === 'leftovers') unit.hp += maxhp / 16;
        unit.hp = Math.min(maxhp, unit.hp);
      }
      if (unit.sleep > 0) unit.sleep--;
      unit.protect = false;
      unit.flinch = false;
      unit.helped = false;
    }
    this.followMe = { mine: null, foe: null };
  }

  // ── Evaluation ─────────────────────────────────────────────────────────

  /**
   * Own HP shares (whole team, so switching is comparable with staying) minus the rivals'
   * shares on the field, with a bonus per Pokémon knocked out.
   */
  private value(start: Map<Unit, number>): number {
    const share = (unit: Unit) => Math.max(0, unit.hp) / Math.max(1, unit.combatant.maxhp);
    const inSim = new Map<OwnMember, number>();
    for (const unit of this.units) {
      if (unit.side === 'mine' && unit.member) inSim.set(unit.member, share(unit));
    }
    let own = 0;
    for (const member of this.situation.own) {
      if (member.fainted) continue;
      own += inSim.get(member) ?? member.combatant.hp / Math.max(1, member.combatant.maxhp);
    }
    let foe = 0;
    let knockouts = 0;
    for (const unit of this.units) {
      const fainted = unit.hp <= 0 && (start.get(unit) ?? 0) > 0;
      if (unit.side === 'foe') {
        foe += share(unit);
        if (fainted) knockouts++;
      } else if (fainted) {
        knockouts--;
      }
    }
    return (own - foe) * 100 + knockouts * (KO_BONUS / 2);
  }
}

/** Side of a unit as a Showdown side id (for debugging/tests). */
export function unitSide(situation: Situation, side: 'mine' | 'foe'): SideId {
  return side === 'mine' ? situation.me : situation.foe;
}
