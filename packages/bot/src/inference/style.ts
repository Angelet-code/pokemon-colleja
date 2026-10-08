/**
 * How the rival plays, learnt during a battle (phase 11, level 3). Every time it searches, the
 * bot writes down what it expected from the rival this turn: its **obvious** reply (level 2's
 * best from the rival's side) and its **counter** (the reply that does best against the bot's
 * own obvious option). Once the turn is in the log it reads what the rival really did. A rival
 * that keeps doing the obvious gets sharper predictions; one that keeps countering gets its
 * counter weighed in. Pure bookkeeping over the visible log: the same log gives the same style.
 */
import { type MoveRequest, positionOf, type SideId, type SlotAction, sideOf } from '@colleja/core';
import { getSpecies, toId } from '@colleja/data';

/** One slot's action in comparable form: `move:earthquake`, `switch:garchomp`. */
export type ActionKey = string;

/** What the bot expected from the rival in a turn (one key per rival slot, `null`: unknown). */
export interface StylePrediction {
  obvious: (ActionKey | null)[];
  counter: (ActionKey | null)[];
}

export interface StyleSummary {
  /** Rival actions compared so far. */
  observed: number;
  /** How often it did the obvious (posterior mean, 0–1). */
  obviousRate: number;
  /** How often it countered when the counter was not the obvious (posterior mean, 0–1). */
  counterRate: number;
}

/** Beta priors: half the time obvious; a counter about as often as any other option. */
const OBVIOUS_PRIOR = { hits: 2, misses: 2 };
const COUNTER_PRIOR = { hits: 1, misses: 4 };
/** Counter rate of a rival that does not try to predict (chance among its options). */
export const COUNTER_CHANCE = COUNTER_PRIOR.hits / (COUNTER_PRIOR.hits + COUNTER_PRIOR.misses);

export class RivalStyle {
  /** Predictions by turn. */
  private readonly predictions = new Map<number, StylePrediction>();

  /** Writes down the expectation for `turn`, forgetting later ones (after a rewind). */
  record(turn: number, prediction: StylePrediction): void {
    for (const key of [...this.predictions.keys()]) {
      if (key >= turn) this.predictions.delete(key);
    }
    this.predictions.set(turn, prediction);
  }

  /** The rival's style from the turns of `log` already played. */
  summary(log: readonly string[], foe: SideId): StyleSummary {
    const actual = rivalActions(log, foe);
    let observed = 0;
    let obvious = 0;
    let counterChances = 0;
    let counters = 0;
    for (const [turn, prediction] of this.predictions) {
      const done = actual.get(turn);
      if (!done) continue;
      prediction.obvious.forEach((expected, slot) => {
        const real = done[slot];
        if (!expected || !real) return;
        observed++;
        if (real === expected) obvious++;
        const counter = prediction.counter[slot];
        if (counter && counter !== expected) {
          counterChances++;
          if (real === counter) counters++;
        }
      });
    }
    return {
      observed,
      obviousRate:
        (obvious + OBVIOUS_PRIOR.hits) / (observed + OBVIOUS_PRIOR.hits + OBVIOUS_PRIOR.misses),
      counterRate:
        (counters + COUNTER_PRIOR.hits) /
        (counterChances + COUNTER_PRIOR.hits + COUNTER_PRIOR.misses),
    };
  }
}

/**
 * What each rival slot did first in every turn of `log`: a voluntary switch or a move (turns
 * where it could not act are left out).
 */
export function rivalActions(
  log: readonly string[],
  foe: SideId,
): Map<number, (ActionKey | null)[]> {
  const actions = new Map<number, (ActionKey | null)[]>();
  let turn = 0;
  let current: (ActionKey | null)[] = [];
  for (const line of log) {
    if (!line.startsWith('|')) continue;
    const [, type = '', a = '', b = ''] = line.split('|');
    if (type === 'turn') {
      if (turn > 0 && current.some((key) => key !== null)) actions.set(turn, current);
      turn = Number(a);
      current = [];
      continue;
    }
    if (turn === 0 || sideOf(a) !== foe) continue;
    const slot = positionOf(a);
    if (current[slot] !== undefined) continue;
    if (type === 'move' && !line.includes('[from]')) {
      current[slot] = `move:${toId(b)}`;
    } else if (type === 'switch') {
      current[slot] = `switch:${speciesKey(b)}`;
    } else if (type === 'cant' || type === 'faint') {
      current[slot] = null;
    }
  }
  return actions;
}

/** `Garchomp-Mega, L50, M` → `garchomp` (switches are compared by base species). */
export function speciesKey(details: string): string {
  const species = getSpecies(toId(details.split(',')[0] ?? ''));
  return species?.changesFrom ?? species?.id ?? '';
}

/** The keys of a choice's actions, from the request they answer. */
export function actionKeys(
  request: MoveRequest,
  actions: readonly SlotAction[],
): (ActionKey | null)[] {
  return actions.map((action, slot) => {
    if (action.type === 'move') {
      const move = request.active[slot]?.moves[action.move - 1]?.id;
      return move ? `move:${move}` : null;
    }
    if (action.type === 'switch') {
      const details = request.side.pokemon[action.slot - 1]?.details;
      return details ? `switch:${speciesKey(details)}` : null;
    }
    return null;
  });
}
