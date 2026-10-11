/**
 * Lead pairs at doubles team preview (fase 16, ADR-0018): how two leads fare against two
 * rival leads, played with the 2 vs 2 simulation (`DoublesSim.evaluateLineup`) like level 2
 * plays a turn. The own side tries its turn-1 options (each move with each sensible target,
 * the most promising ones together), the rivals attack like a damage-maximising player, and
 * the balance after the first turns is the value of the pair against that rival pair.
 * Deterministic: no random generator.
 */
import { getMove } from '@colleja/data';
import { type Combatant, weatherAfter } from '../analysis/combatant';
import { DoublesSim, type SimLineup, type SimTrace, type SlotPlan } from '../analysis/doubles-sim';
import { SELF_KO_MOVES, STATUS_MOVES } from '../analysis/move-knowledge';
import type { Situation } from '../analysis/situation';

/** Single-target moves (aimed at one rival). */
const SINGLE_TARGETS = new Set(['normal', 'any', 'adjacentFoe', 'randomNormal']);

interface LeadOption {
  plan: SlotPlan;
  /** Accuracy of a status move's effect (evaluated as hit/miss mix). */
  chance: number;
}

/** The value of a lead pair against a rival pair and the turn-1 plans that reach it. */
export interface LeadMatchup {
  value: number;
  plans: SlotPlan[];
}

/**
 * Value of `mine` (two leads, own side of `situation`) against `foe` (two rival leads): the
 * best turn-1 plan pair, keeping the `kept` best options of each slot (each tried with the
 * partner on autopilot). Played in the weather the four leads bring.
 */
export function leadMatchup(
  situation: Situation,
  mine: readonly Combatant[],
  foe: readonly Combatant[],
  kept: number,
): LeadMatchup {
  const field = situation.withWeather(weatherAfter([...mine, ...foe], situation.field.weather));
  const lineup: SimLineup = { mine, foe };
  const options = mine.map((combatant) => slotOptions(combatant));
  const best = options.map((list, index) => {
    if (list.length <= kept) return list;
    const scored = list.map((option) => {
      const plans: SlotPlan[] = [{ kind: 'auto' }, { kind: 'auto' }];
      plans[index] = option.plan;
      return { option, score: evaluate(field, lineup, plans, [option]) };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, kept).map((entry) => entry.option);
  });
  const [first = [], second = []] = best;
  let result: LeadMatchup = { value: -Infinity, plans: [{ kind: 'auto' }, { kind: 'auto' }] };
  for (const a of first) {
    for (const b of second.length > 0 ? second : [null]) {
      const chosen = b ? [a, b] : [a];
      const plans = chosen.map((option) => option.plan);
      const value = evaluate(field, lineup, plans, chosen);
      if (value > result.value) result = { value, plans };
    }
  }
  if (result.value === -Infinity) {
    result.value = DoublesSim.evaluateLineup(field, lineup, result.plans);
  }
  return result;
}

/** What happened in a matchup's best plans (for the explanation). */
export function traceMatchup(
  situation: Situation,
  mine: readonly Combatant[],
  foe: readonly Combatant[],
  plans: readonly SlotPlan[],
): SimTrace {
  const field = situation.withWeather(weatherAfter([...mine, ...foe], situation.field.weather));
  const trace: SimTrace = { events: [], damage: [] };
  DoublesSim.evaluateLineup(field, { mine, foe }, plans, trace);
  return trace;
}

/** Value of plans, mixing hit/miss for inaccurate status moves (as level 2). */
function evaluate(
  situation: Situation,
  lineup: SimLineup,
  plans: SlotPlan[],
  options: readonly LeadOption[],
): number {
  let score = DoublesSim.evaluateLineup(situation, lineup, plans);
  for (const option of options) {
    if (option.chance >= 1) continue;
    const missed = plans.map((plan) =>
      plan === option.plan ? { ...plan, effectLands: false } : plan,
    );
    score =
      option.chance * score +
      (1 - option.chance) * DoublesSim.evaluateLineup(situation, lineup, missed);
  }
  return score;
}

/** Turn-1 options of a lead: each move (attacks at each rival), never attacking the ally. */
function slotOptions(combatant: Combatant): LeadOption[] {
  const options: LeadOption[] = [];
  for (const move of combatant.moves) {
    const data = getMove(move);
    if (!data || SELF_KO_MOVES.has(move)) continue;
    const accuracy = data.accuracy === true ? 1 : data.accuracy / 100;
    const chance = move in STATUS_MOVES && data.category === 'Status' ? accuracy : 1;
    const targets = SINGLE_TARGETS.has(data.target) ? [1, 2] : [undefined];
    for (const target of targets) {
      options.push({
        plan: { kind: 'move', move, ...(target !== undefined ? { target } : {}) },
        chance,
      });
    }
  }
  return options.length > 0 ? options : [{ plan: { kind: 'auto' }, chance: 1 }];
}
