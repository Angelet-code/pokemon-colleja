/**
 * Shared evaluation used by the thinking bots (levels 1 and 2): who a move hits, how much a
 * hit is worth, matchups between two Pokémon, the best Pokémon to send in and team preview.
 */
import type { SeededRandom } from '@colleja/core';
import { getMove, type MoveId } from '@colleja/data';
import type { Combatant } from './combatant';
import { type DamageEstimate, expectedHpShare } from './damage';
import { battleForm, type FoeMember, type OwnMember, type Situation } from './situation';

/** Extra value of knocking a Pokémon out, on top of the HP removed (100 = a full HP bar). */
export const KO_BONUS = 50;

/** Value of a hit: % of the defender's max HP removed plus the KO bonus, times accuracy. */
export function hitValue(estimate: DamageEstimate, defender: Combatant): number {
  return (
    expectedHpShare(estimate, defender) * 100 + estimate.koChance * estimate.accuracy * KO_BONUS
  );
}

export interface Victims {
  foes: FoeMember[];
  allies: OwnMember[];
  /** Probability of hitting each listed foe (`randomNormal` moves pick one at random). */
  weight: number;
}

const SINGLE_TARGET = new Set(['normal', 'any', 'adjacentFoe', 'randomNormal']);

/**
 * Pokémon hit by `move` used from own `slot` with optional target location (`+N` rival,
 * `-N` own). Like Showdown, a move aimed at an empty rival position goes to the other rival.
 */
export function moveVictims(
  situation: Situation,
  slot: number,
  moveId: MoveId,
  target: number | undefined,
): Victims {
  const moveTarget = getMove(moveId)?.target ?? 'normal';
  const foes = situation.activeFoes();
  if (target !== undefined && target > 0) {
    const foe = situation.foeAt(target - 1) ?? foes[0];
    return { foes: foe ? [foe] : [], allies: [], weight: 1 };
  }
  if (target !== undefined && target < 0) {
    const index = -target - 1;
    const ally = index === slot ? undefined : situation.ownActive(index);
    return { foes: [], allies: ally && !ally.fainted ? [ally] : [], weight: 1 };
  }
  if (SINGLE_TARGET.has(moveTarget)) {
    if (!situation.doubles) return { foes: foes.slice(0, 1), allies: [], weight: 1 };
    return { foes, allies: [], weight: foes.length > 0 ? 1 / foes.length : 1 };
  }
  if (moveTarget === 'allAdjacentFoes') return { foes, allies: [], weight: 1 };
  if (moveTarget === 'allAdjacent') {
    const ally = situation.allyOf(slot);
    return { foes, allies: ally ? [ally] : [], weight: 1 };
  }
  return { foes: [], allies: [], weight: 1 };
}

/** Best value `attacker` can get against `defender` with one of its moves. */
export function bestHit(
  situation: Situation,
  attacker: Combatant,
  defender: Combatant,
): { move: MoveId | null; value: number; estimate: DamageEstimate | null } {
  let best: { move: MoveId | null; value: number; estimate: DamageEstimate | null } = {
    move: null,
    value: 0,
    estimate: null,
  };
  for (const move of attacker.moves) {
    const estimate = situation.damage(attacker, defender, move);
    const value = hitValue(estimate, defender);
    if (value > best.value) best = { move, value, estimate };
  }
  return best;
}

/**
 * How good `mine` is against `foe` (positive = good for us): damage dealt minus damage taken,
 * plus a bonus for KOing first and a malus for being KOed first.
 */
export function matchup(situation: Situation, mine: Combatant, foe: Combatant): number {
  const offense = bestHit(situation, mine, foe);
  const defense = bestHit(situation, foe, mine);
  const first = situation.movesFirst(mine, foe);
  let score = offense.value - defense.value;
  score += 30 * (offense.estimate?.koChance ?? 0) * first;
  score -= 30 * (defense.estimate?.koChance ?? 0) * (1 - first);
  return score;
}

/** Average matchup of an own Pokémon against the rivals on the field (or all known ones). */
export function matchupAgainstField(situation: Situation, mine: Combatant): number {
  const active = situation.activeFoes();
  const foes = active.length > 0 ? active : situation.foes.filter((foe) => foe.combatant.hp > 0);
  if (foes.length === 0) return 0;
  const total = foes.reduce((sum, foe) => sum + matchup(situation, mine, foe.combatant), 0);
  return total / foes.length;
}

/**
 * Value of sending `member` in now: its matchup minus the hit it takes on entry
 * (the strongest rival attack, halved because the rival may not use it on it).
 */
export function switchInValue(situation: Situation, member: OwnMember): number {
  const form = battleForm(member.combatant);
  let entry = 0;
  for (const foe of situation.activeFoes()) {
    entry = Math.max(entry, bestHit(situation, foe.combatant, member.combatant).value);
  }
  return matchupAgainstField(situation, form) - entry / 2;
}

/** Best bench position (1-based) among `positions`, or `null` if there is none. */
export function bestSwitch(
  situation: Situation,
  positions: readonly number[],
  random: SeededRandom,
): number | null {
  const scored = positions.flatMap((position) => {
    const member = situation.own[position - 1];
    return member ? [{ position, score: switchInValue(situation, member) }] : [];
  });
  return pickBest(scored, random)?.position ?? null;
}

/**
 * Team preview: scores each own Pokémon (Mega form if it holds its stone) against every
 * rival species and brings the best `picked`, the best first (leads).
 */
export function teamPreviewOrder(
  situation: Situation,
  picked: number,
  random: SeededRandom,
): number[] {
  const foes = situation.foes;
  const scored = situation.own.map((member) => {
    const form = battleForm(member.combatant);
    const total = foes.reduce((sum, foe) => sum + matchup(situation, form, foe.combatant), 0);
    // A little noise so the bot does not always bring the same Pokémon against similar teams.
    const score = (foes.length > 0 ? total / foes.length : 0) + random.next() * 4;
    return { position: member.position, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, picked).map((entry) => entry.position);
}

/** Highest scoring entry; ties (within `tolerance`) broken at random. */
export function pickBest<T extends { score: number }>(
  entries: readonly T[],
  random: SeededRandom,
  tolerance = 0.01,
): T | undefined {
  if (entries.length === 0) return undefined;
  const best = Math.max(...entries.map((entry) => entry.score));
  return random.pick(entries.filter((entry) => entry.score >= best - tolerance));
}
