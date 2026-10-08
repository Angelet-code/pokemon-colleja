/**
 * Level 1 bot, "aggressive": in every slot, the move and target with the highest expected
 * damage (KOs first, priority when it secures them). Never hits its ally unless the ally is
 * immune, Mega Evolves at the first chance and only switches when no move does anything.
 * Team preview and replacements by simple matchups (damage dealt vs taken).
 */
import {
  type AgentContext,
  type BattleAgent,
  type Choice,
  type DecisionExplanation,
  getSlotOptions,
  type MoveOption,
  type MoveRequest,
  PASS,
  requestKind,
  SeededRandom,
  type SlotAction,
  type SlotOptions,
  type SwitchRequest,
  type TeamPreviewRequest,
  teamChoice,
} from '@colleja/core';
import { getMove, type MoveId } from '@colleja/data';
import { type Combatant, megaEvolved } from '../analysis/combatant';
import type { DamageEstimate } from '../analysis/damage';
import {
  bestSwitch,
  hitValue,
  KO_BONUS,
  moveVictims,
  pickBest,
  switchInValue,
  teamPreviewOrder,
} from '../analysis/evaluation';
import { FIRST_TURN_MOVES, SELF_KO_MOVES } from '../analysis/move-knowledge';
import { type FoeMember, type OwnMember, Situation } from '../analysis/situation';
import {
  describeAction,
  EXPLANATION_METHODS,
  type ExplainContext,
  explanation,
  roundScore,
} from '../explain';
import type { BotLevel } from '../levels';

export interface BotOptions {
  /** Same seed → same decisions for the same situations (ties are broken at random). */
  seed?: string;
}

/** One possible action of one slot and its value. */
export interface Candidate {
  action: SlotAction;
  score: number;
}

/** Below this value a move is "useless" and the bot prefers switching. */
export const USEFUL_SCORE = 10;
/** Damage to the own ally counts this many times the same damage to a rival. */
const ALLY_DAMAGE_WEIGHT = 3;

export class AggressiveAgent implements BattleAgent {
  readonly name: string = 'Bot agresivo';
  readonly level: BotLevel = 1;
  protected readonly random: SeededRandom;
  /** Builds the explanation of the last decision on demand (only the server asks for it). */
  protected explainLast: (() => DecisionExplanation) | null = null;

  constructor(options: BotOptions = {}) {
    this.random = new SeededRandom(options.seed ?? String(Math.random()));
  }

  explain(): DecisionExplanation | null {
    return this.explainLast?.() ?? null;
  }

  choose(context: AgentContext): Choice {
    this.explainLast = null;
    const situation = this.situation(context);
    const { request } = context;
    switch (requestKind(request)) {
      case 'team':
        return this.chooseTeam(situation, request as TeamPreviewRequest);
      case 'switch':
        return this.chooseReplacements(situation, request as SwitchRequest);
      default:
        return this.chooseMoves(situation, request as MoveRequest);
    }
  }

  /** What the bot makes of its context before deciding. */
  protected situation(context: AgentContext): Situation {
    return new Situation(context);
  }

  protected chooseTeam(situation: Situation, request: TeamPreviewRequest): Choice {
    const picked = request.maxChosenTeamSize ?? request.side.pokemon.length;
    return teamChoice(teamPreviewOrder(situation, picked, this.random));
  }

  protected chooseReplacements(situation: Situation, request: SwitchRequest): Choice {
    const chosen = new Set<number>();
    const slots = getSlotOptions(request);
    const considered: { slot: SlotOptions; positions: number[]; picked: number | null }[] = [];
    const actions = slots.map((slot): SlotAction => {
      const positions = slot.mustPass ? [] : slot.switches.filter((p) => !chosen.has(p));
      const position = bestSwitch(situation, positions, this.random);
      considered.push({ slot, positions, picked: position });
      if (position === null) return PASS;
      chosen.add(position);
      return { type: 'switch', slot: position };
    });
    this.explainLast = () =>
      explanation(
        'switch',
        EXPLANATION_METHODS.switchIn,
        considered.map(({ slot, positions, picked }) =>
          positions.flatMap((position) => {
            const member = situation.own[position - 1];
            if (!member) return [];
            return [
              {
                actions: [
                  describeAction(explainContext(situation), slot, {
                    type: 'switch',
                    slot: position,
                  }),
                ],
                score: roundScore(switchInValue(situation, member)),
                chosen: position === picked,
              },
            ];
          }),
        ),
      );
    return { type: 'actions', actions };
  }

  /** Greedy, slot by slot, keeping the choices compatible (no double switch, one Mega). */
  protected chooseMoves(situation: Situation, request: MoveRequest): Choice {
    const chosen: Candidate[] = [];
    const considered: { slot: SlotOptions; candidates: Candidate[] }[] = [];
    for (const slot of getSlotOptions(request)) {
      // Only one Pokémon can Mega Evolve: a later slot fights in its base form.
      const megaTaken = chosen.some((c) => c.action.type === 'move' && c.action.mega);
      const candidates = slot.mustPass ? [] : this.slotCandidates(situation, slot, !megaTaken);
      const compatible = candidates.filter((c) => chosen.every((other) => compatible2(c, other)));
      chosen.push(pickBest(compatible, this.random) ?? { action: PASS, score: 0 });
      considered.push({ slot, candidates: compatible });
    }
    this.explainLast = () =>
      explanation(
        'moves',
        EXPLANATION_METHODS.damage,
        considered.map(({ slot, candidates }) =>
          candidates.map((candidate) => ({
            actions: [describeAction(explainContext(situation), slot, candidate.action)],
            score: roundScore(candidate.score),
            chosen: chosen.includes(candidate),
          })),
        ),
      );
    return { type: 'actions', actions: chosen.map((candidate) => candidate.action) };
  }

  private slotCandidates(
    situation: Situation,
    slot: SlotOptions,
    megaAllowed: boolean,
  ): Candidate[] {
    const member = situation.own[slot.index];
    if (!member) return [];
    // Mega Evolve at the first chance.
    const mega = slot.canMega && megaAllowed;
    const attacker = mega ? megaEvolved(member.combatant) : member.combatant;
    const moves: Candidate[] = [];
    for (const option of slot.moves) {
      if (option.disabled) continue;
      const targets = option.targets.length > 0 ? option.targets : [undefined];
      for (const target of targets) {
        const action: SlotAction = { type: 'move', move: option.slot };
        if (target !== undefined) action.target = target;
        if (mega) action.mega = true;
        moves.push({ action, score: moveScore(situation, slot, member, attacker, option, target) });
      }
    }
    const best = Math.max(-Infinity, ...moves.map((move) => move.score));
    if (best < USEFUL_SCORE) {
      const position = bestSwitch(situation, slot.switches, this.random);
      if (position !== null)
        moves.push({ action: { type: 'switch', slot: position }, score: USEFUL_SCORE });
    }
    return moves;
  }
}

/** What `describeAction` needs to know about the deciding side. */
export function explainContext(situation: Situation): ExplainContext {
  return { request: situation.context.request, view: situation.view, side: situation.me };
}

/** Expected value of a move: damage to rivals (+ KO bonus), minus damage to the ally. */
function moveScore(
  situation: Situation,
  slot: SlotOptions,
  member: OwnMember,
  attacker: Combatant,
  option: MoveOption,
  target: number | undefined,
): number {
  const moveId = option.move.id;
  const move = getMove(moveId);
  // Fake Out and friends fail after the first turn on the field.
  if (!move || (FIRST_TURN_MOVES.has(moveId) && member.view?.movedSinceSwitch)) return -1000;
  const victims = moveVictims(situation, slot.index, moveId, target);
  const hits = victims.foes.map((foe) => ({
    foe,
    estimate: situation.damage(attacker, foe.combatant, moveId),
  }));
  let score = hits.reduce(
    (sum, hit) => sum + hitValue(hit.estimate, hit.foe.combatant) * victims.weight,
    0,
  );
  for (const ally of victims.allies) {
    const estimate = situation.damage(attacker, ally.combatant, moveId);
    score -= hitValue(estimate, ally.combatant) * ALLY_DAMAGE_WEIGHT;
  }
  return score + adjustments(situation, member, moveId, hits, score);
}

/** Self-KO moves, two-turn and recharge moves, and priority that secures a KO. */
function adjustments(
  situation: Situation,
  member: OwnMember,
  moveId: MoveId,
  hits: readonly { foe: FoeMember; estimate: DamageEstimate }[],
  damage: number,
): number {
  const move = getMove(moveId);
  if (!move) return 0;
  let bonus = 0;
  const { combatant } = member;
  if (SELF_KO_MOVES.has(moveId)) bonus -= (combatant.hp / combatant.maxhp) * 100 + 30;
  const sun = situation.field.weather === 'sunnyday' || situation.field.weather === 'desolateland';
  const solar = (moveId === 'solarbeam' || moveId === 'solarblade') && sun;
  if (move.flags.includes('charge') && combatant.item !== 'powerherb' && !solar)
    bonus -= damage / 2;
  if (move.flags.includes('recharge')) bonus -= damage * 0.3;
  if (move.priority > 0) {
    for (const hit of hits) {
      const first = situation.movesFirst(hit.foe.combatant, combatant);
      bonus += hit.estimate.koChance * hit.estimate.accuracy * first * (KO_BONUS / 2);
    }
  }
  return bonus;
}

/** Two slots' choices can be combined: no double switch to the same Pokémon, one Mega. */
export function compatible2(a: Candidate, b: Candidate): boolean {
  if (a.action.type === 'switch' && b.action.type === 'switch') {
    return a.action.slot !== b.action.slot;
  }
  return !(a.action.type === 'move' && a.action.mega && b.action.type === 'move' && b.action.mega);
}
