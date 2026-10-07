/**
 * Doubles planning for the tactical bot: builds the options of each slot, keeps the most
 * promising ones (each tried with the partner on autopilot) and then evaluates every
 * compatible pair together with `DoublesSim`.
 */
import type { SeededRandom, SlotAction, SlotOptions } from '@colleja/core';
import { getMove } from '@colleja/data';
import { DoublesSim, type SlotPlan } from './doubles-sim';
import { pickBest } from './evaluation';
import { FIRST_TURN_MOVES, PROTECT_MOVES, STATUS_MOVES } from './move-knowledge';
import type { Situation } from './situation';

interface SlotOption {
  action: SlotAction;
  plan: SlotPlan;
  /** Accuracy of a status move's effect (evaluated as hit/miss mix). */
  chance: number;
}

/** Options per slot kept for the joint search. */
const KEPT_PER_SLOT = 8;
/** Small push to Mega Evolve (permanent boost) when it does not hurt. */
const MEGA_BONUS = 1;
/** Tempo cost of switching. */
const SWITCH_COST = 5;

/** A pair of actions (one per slot) and its simulated value. */
export interface PlannedPair {
  actions: SlotAction[];
  score: number;
}

/**
 * Best pair of actions for the two slots (and every pair evaluated, for explanations), or
 * `null` if there is nothing to plan.
 */
export function planDoubles(
  situation: Situation,
  slots: readonly SlotOptions[],
  random: SeededRandom,
): { chosen: PlannedPair; pairs: PlannedPair[] } | null {
  if (slots.length !== 2 || situation.activeFoes().length === 0) return null;
  const options = slots.map((slot) => slotOptions(situation, slot));

  // Prune: each option with the partner on autopilot.
  const kept = options.map((list, index) => {
    if (list.length <= KEPT_PER_SLOT) return list;
    const scored = list.map((option) => {
      const plans: SlotPlan[] = [{ kind: 'pass' }, { kind: 'pass' }];
      plans[index] = option.plan;
      plans[1 - index] = { kind: 'auto' };
      return { option, score: evaluate(situation, plans, [option]) };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, KEPT_PER_SLOT).map((entry) => entry.option);
  });

  const [first = [], second = []] = kept;
  const pairs: PlannedPair[] = [];
  for (const a of first) {
    for (const b of second) {
      if (!compatible(a.action, b.action)) continue;
      const score = evaluate(situation, [a.plan, b.plan], [a, b]);
      pairs.push({ actions: [a.action, b.action], score });
    }
  }
  const chosen = pickBest(pairs, random);
  return chosen ? { chosen, pairs } : null;
}

/** Value of a pair of plans, mixing hit/miss for inaccurate status moves. */
function evaluate(situation: Situation, plans: SlotPlan[], options: readonly SlotOption[]): number {
  let score = DoublesSim.evaluate(situation, plans);
  for (const option of options) {
    if (option.chance >= 1) continue;
    const missed = plans.map((plan) =>
      plan === option.plan ? { ...plan, effectLands: false } : plan,
    );
    score = option.chance * score + (1 - option.chance) * DoublesSim.evaluate(situation, missed);
  }
  for (const option of options) {
    if (option.action.type === 'move' && option.action.mega) score += MEGA_BONUS;
    if (option.action.type === 'switch') score -= SWITCH_COST;
  }
  return score;
}

function slotOptions(situation: Situation, slot: SlotOptions): SlotOption[] {
  if (slot.mustPass) return [{ action: { type: 'pass' }, plan: { kind: 'pass' }, chance: 1 }];
  const member = situation.own[slot.index];
  const options: SlotOption[] = [];
  const view = member?.view;
  const megas = slot.canMega ? [false, true] : [false];
  for (const mega of megas) {
    for (const option of slot.moves) {
      if (option.disabled) continue;
      const moveId = option.move.id;
      const data = getMove(moveId);
      if (!data) continue;
      if (FIRST_TURN_MOVES.has(moveId) && view?.movedSinceSwitch) continue;
      // Consecutive Protect usually fails: simulate it as doing nothing.
      const failsProtect =
        PROTECT_MOVES.has(moveId) &&
        view?.lastMove !== null &&
        view?.lastMove !== undefined &&
        PROTECT_MOVES.has(view.lastMove) &&
        view.lastMoveTurn === situation.view.turn - 1;
      // Attacks on the ally are pointless except in odd cases: skip them.
      const targets = option.targets.length > 0 ? option.targets : [undefined];
      for (const target of targets) {
        if (target !== undefined && target < 0 && data.category !== 'Status') continue;
        const action: SlotAction = { type: 'move', move: option.slot };
        if (target !== undefined) action.target = target;
        if (mega) action.mega = true;
        const plan: SlotPlan = failsProtect
          ? { kind: 'pass' }
          : { kind: 'move', move: moveId, ...(target !== undefined ? { target } : {}), mega };
        const accuracy = data.accuracy === true ? 1 : data.accuracy / 100;
        const chance = moveId in STATUS_MOVES && data.category === 'Status' ? accuracy : 1;
        options.push({ action, plan, chance });
      }
    }
  }
  for (const position of slot.switches) {
    const incoming = situation.own[position - 1];
    if (!incoming) continue;
    options.push({
      action: { type: 'switch', slot: position },
      plan: { kind: 'switch', switchTo: incoming },
      chance: 1,
    });
  }
  return options.length > 0
    ? options
    : [{ action: { type: 'pass' }, plan: { kind: 'pass' }, chance: 1 }];
}

function compatible(a: SlotAction, b: SlotAction): boolean {
  if (a.type === 'switch' && b.type === 'switch') return a.slot !== b.slot;
  return !(a.type === 'move' && a.mega && b.type === 'move' && b.mega);
}
