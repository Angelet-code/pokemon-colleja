/**
 * Expected-damage duel simulation: two Pokémon trade their best attacks turn after turn
 * (speed and priority order, accuracy, status, sleep, end-of-turn chip and healing) until one
 * faints. Cheap enough to run for every option of a decision, it lets the tactical bot value
 * an action by its consequences: KO races, setup, burns, paralysis, recovery, Fake Out,
 * switching into an attack, or sacrificing a Pokémon versus saving it.
 */
import type { BoostId } from '@colleja/core';
import { getMove, type MoveId } from '@colleja/data';
import { type Combatant, hasChoiceItem, typesOf } from './combatant';
import { FIRST_TURN_MOVES, SELF_KO_MOVES } from './move-knowledge';
import type { Situation } from './situation';

/** What happens on the first turn of the duel. */
export interface Opening {
  /** Attack used by `mine` on turn 1 (`null`: no attack — status move, switch, Protect…). */
  move?: MoveId | null;
  /** Priority of `mine`'s turn-1 action (defaults to the move's). */
  priority?: number;
  /** `mine` is switching in: it takes the rival's attack and does not act. */
  switchingIn?: boolean;
  /**
   * Who the rival aims its turn-1 attack at (the Pokémon on the field before a switch).
   * Defaults to `mine`.
   */
  foeAimsAt?: Combatant;
  /** `mine` protects itself: the rival's turn-1 attack does nothing. */
  protect?: boolean;
  /** The rival flinches on turn 1 (Fake Out). */
  flinch?: boolean;
  /** `mine` after its turn-1 action (boosted, healed…; its Mega form after switching in). */
  mineAfter?: Combatant;
  /** Rival after `mine`'s turn-1 action (burned, paralysed, asleep…). */
  foeAfter?: Combatant;
  /** HP healed by `mine` on turn 1, as a share of its max HP. */
  heal?: number;
}

export interface DuelResult {
  /** HP left at the end (0 = fainted). */
  mineHp: number;
  foeHp: number;
  /** Final forms (with boosts/status applied during the duel). */
  mine: Combatant;
  foe: Combatant;
  turns: number;
}

const MAX_TURNS = 10;
/** Turns a Pokémon put to sleep stays asleep, on average. */
const SLEEP_TURNS = 2;

interface Attack {
  move: MoveId | null;
  damage: number;
  priority: number;
}

/** Best attack (expected damage) of `attacker` against `defender`. Cached per situation. */
const attackCache = new WeakMap<Situation, WeakMap<Combatant, WeakMap<Combatant, Attack[]>>>();

function bestAttack(
  situation: Situation,
  attacker: Combatant,
  defender: Combatant,
  fresh: boolean,
): Attack {
  let bySituation = attackCache.get(situation);
  if (!bySituation) {
    bySituation = new WeakMap();
    attackCache.set(situation, bySituation);
  }
  let byAttacker = bySituation.get(attacker);
  if (!byAttacker) {
    byAttacker = new WeakMap();
    bySituation.set(attacker, byAttacker);
  }
  let cached = byAttacker.get(defender);
  if (!cached) {
    cached = [
      pickAttack(situation, attacker, defender, true),
      pickAttack(situation, attacker, defender, false),
    ];
    byAttacker.set(defender, cached);
  }
  return cached[fresh ? 0 : 1] as Attack;
}

function pickAttack(
  situation: Situation,
  attacker: Combatant,
  defender: Combatant,
  fresh: boolean,
): Attack {
  let best: Attack = { move: null, damage: 0, priority: 0 };
  for (const move of attacker.moves) {
    if (SELF_KO_MOVES.has(move) || (!fresh && FIRST_TURN_MOVES.has(move))) continue;
    const damage = attackDamage(situation, attacker, defender, move);
    if (damage > best.damage) {
      best = { move, damage, priority: getMove(move)?.priority ?? 0 };
    }
  }
  return best;
}

/** Expected damage of one use of `move`, discounting two-turn and recharge moves. */
export function attackDamage(
  situation: Situation,
  attacker: Combatant,
  defender: Combatant,
  move: MoveId,
): number {
  const data = getMove(move);
  if (!data || data.category === 'Status') return 0;
  const estimate = situation.damage(attacker, defender, move);
  let damage = estimate.avg * estimate.accuracy;
  const sun = situation.field.weather === 'sunnyday' || situation.field.weather === 'desolateland';
  const solar = (move === 'solarbeam' || move === 'solarblade') && sun;
  if (data.flags.includes('charge') && attacker.item !== 'powerherb' && !solar) damage /= 2;
  if (data.flags.includes('recharge')) damage /= 2;
  if (attacker.status === 'par') damage *= 0.75;
  return damage;
}

/** Plays out the duel. `mine` and `foe` start with their current HP. */
export function simulateDuel(
  situation: Situation,
  mineStart: Combatant,
  foeStart: Combatant,
  opening: Opening = {},
): DuelResult {
  let mine = mineStart;
  let foe = foeStart;
  let mineHp = mine.hp;
  let foeHp = foe.hp;
  let mineSleep = mine.status === 'slp' ? SLEEP_TURNS : 0;
  let foeSleep = foe.status === 'slp' ? SLEEP_TURNS : 0;
  // Choice items lock the holder into the first move it uses.
  let mineLock = mine.lockedMove ?? null;
  let foeLock = foe.lockedMove ?? null;
  const locked = (attacker: Combatant, defender: Combatant, move: MoveId): Attack => ({
    move,
    damage: attackDamage(situation, attacker, defender, move),
    priority: getMove(move)?.priority ?? 0,
  });
  let turn = 1;

  for (; turn <= MAX_TURNS && mineHp > 0 && foeHp > 0; turn++) {
    const first = turn === 1;
    // First-turn moves (Fake Out, First Impression) only before having moved since entering.
    const foeFresh = first && foeStart.fresh === true;
    const mineFresh = opening.switchingIn ? turn === 2 : first && mineStart.fresh === true;
    const foeAttack = foeLock
      ? locked(foe, mine, foeLock)
      : bestAttack(situation, foe, (first && opening.foeAimsAt) || mine, foeFresh);
    let mineAttack: Attack;
    if (first && (opening.move !== undefined || opening.switchingIn || opening.protect)) {
      const move = opening.switchingIn ? null : (opening.move ?? null);
      mineAttack = {
        move,
        damage: move ? attackDamage(situation, mine, foe, move) : 0,
        priority: opening.priority ?? (move ? (getMove(move)?.priority ?? 0) : 0),
      };
    } else {
      mineAttack = mineLock
        ? locked(mine, foe, mineLock)
        : bestAttack(situation, mine, foe, mineFresh);
    }
    const foeActs = foeSleep === 0 && !(first && (opening.flinch || opening.protect));
    const mineActs = mineSleep === 0 && !(first && opening.switchingIn);

    const mineAction = () => {
      if (first && opening.switchingIn) return;
      if (mineActs && mineAttack.move) {
        const dealt = Math.min(mineAttack.damage, Math.max(0, foeHp));
        foeHp -= dealt;
        mineHp += afterHit(mineAttack.move, dealt);
        if (hasChoiceItem(mine)) mineLock = mineAttack.move;
      }
      if (first) {
        if (opening.heal) mineHp = Math.min(mine.maxhp, mineHp + opening.heal * mine.maxhp);
        if (opening.mineAfter) mine = opening.mineAfter;
        if (opening.foeAfter) {
          foe = opening.foeAfter;
          if (foe.status === 'slp' && foeSleep === 0) foeSleep = SLEEP_TURNS + 1;
        }
        if (mine.status === 'slp' && mineSleep === 0) mineSleep = SLEEP_TURNS + 1;
      }
    };
    const foeAction = () => {
      if (foeActs && foeAttack.move) {
        const damage = attackDamage(situation, foe, mine, foeAttack.move);
        const dealt = Math.min(damage, Math.max(0, mineHp));
        mineHp -= dealt;
        foeHp += afterHit(foeAttack.move, dealt);
        if (hasChoiceItem(foe)) foeLock = foeAttack.move;
      }
    };

    const mineFirst =
      (first && opening.switchingIn) ||
      mineAttack.priority > foeAttack.priority ||
      (mineAttack.priority === foeAttack.priority && situation.movesFirst(mine, foe) >= 0.5);
    if (mineFirst) {
      mineAction();
      if (foeHp > 0) foeAction();
    } else {
      foeAction();
      if (mineHp > 0) mineAction();
    }
    if (mineHp > 0) mineHp += endOfTurn(mine, mineActs && mineAttack.move !== null);
    if (foeHp > 0) foeHp += endOfTurn(foe, foeActs && foeAttack.move !== null);
    mineHp = Math.min(mine.maxhp, mineHp);
    foeHp = Math.min(foe.maxhp, foeHp);
    if (mineSleep > 0) mineSleep--;
    if (foeSleep > 0) foeSleep--;
    // A Pokémon that switched in Mega Evolves on its first action.
    if (first && opening.switchingIn && opening.mineAfter) mine = opening.mineAfter;
  }
  return { mineHp: Math.max(0, mineHp), foeHp: Math.max(0, foeHp), mine, foe, turns: turn - 1 };
}

/** HP the attacker gains (drain) or loses (recoil) after dealing `dealt` damage. */
function afterHit(move: MoveId, dealt: number): number {
  const data = getMove(move);
  if (!data) return 0;
  let change = 0;
  if (data.drain) change += (dealt * data.drain[0]) / data.drain[1];
  if (data.recoil) change -= (dealt * data.recoil[0]) / data.recoil[1];
  return change;
}

/** HP change at the end of a turn: status chip, Leftovers, Life Orb recoil. */
function endOfTurn(combatant: Combatant, attacked: boolean): number {
  const { maxhp } = combatant;
  let change = 0;
  if (combatant.status === 'brn') change -= maxhp / 16;
  if (combatant.status === 'psn') change -= maxhp / 8;
  if (combatant.status === 'tox') change -= maxhp / 8; // averaged over a few turns
  if (combatant.item === 'leftovers') change += maxhp / 16;
  if (combatant.item === 'blacksludge') {
    change += typesOf(combatant).includes('Poison') ? maxhp / 16 : -maxhp / 8;
  }
  if (combatant.item === 'lifeorb' && attacked) change -= maxhp / 10;
  return change;
}

/** Share of max HP. */
export function hpShare(combatant: Combatant, hp: number): number {
  return combatant.maxhp > 0 ? Math.max(0, hp) / combatant.maxhp : 0;
}

/**
 * Material balance after `active` (opening with `opening`) fights `foe`, and — if `active`
 * falls — `next` comes in for free to finish the job:
 * own HP shares left (`active` + `next`) minus the rival's share left. Range ≈ [-1, 2].
 */
export function chainValue(
  situation: Situation,
  active: Combatant,
  next: Combatant | null,
  foe: Combatant,
  opening: Opening = {},
): number {
  const first = simulateDuel(situation, active, foe, opening);
  const nextShare = next ? hpShare(next, next.hp) : 0;
  if (first.foeHp <= 0 || first.mineHp > 0 || !next) {
    return hpShare(active, first.mineHp) + nextShare - hpShare(foe, first.foeHp);
  }
  const wounded: Combatant = { ...first.foe, hp: first.foeHp, fresh: false };
  const second = simulateDuel(situation, { ...next, fresh: true }, wounded);
  return hpShare(next, second.mineHp) - hpShare(foe, second.foeHp);
}

const variantCache = new WeakMap<Combatant, Map<string, Combatant>>();

/** Memoised variant of a combatant (keeps damage estimates cached across simulations). */
function variant(combatant: Combatant, key: string, make: () => Combatant): Combatant {
  let byKey = variantCache.get(combatant);
  if (!byKey) {
    byKey = new Map();
    variantCache.set(combatant, byKey);
  }
  let result = byKey.get(key);
  if (!result) {
    result = make();
    byKey.set(key, result);
  }
  return result;
}

/** Copy of a combatant with stat stages added (clamped to ±6). */
export function withBoosts(
  combatant: Combatant,
  boosts: Partial<Record<BoostId, number>>,
): Combatant {
  return variant(combatant, `boosts:${JSON.stringify(boosts)}`, () => {
    const next = { ...combatant.boosts };
    for (const [stat, stages] of Object.entries(boosts) as [BoostId, number][]) {
      next[stat] = Math.max(-6, Math.min(6, (next[stat] ?? 0) + stages));
    }
    return { ...combatant, boosts: next };
  });
}

export function withStatus(combatant: Combatant, status: string): Combatant {
  return variant(combatant, `status:${status}`, () => ({ ...combatant, status }));
}
