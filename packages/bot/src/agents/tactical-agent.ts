/**
 * Level 2 bot, "tactical": values every option by simulating its consequences with expected
 * damage instead of looking only at this turn's damage.
 * - Singles (`planSingles`): duels between the active Pokémon (or the one switching in) and
 *   the rival, averaged over the rival's plausible sets. Covers KO races, switching into a
 *   resisted hit, sacrificing vs saving a Pokémon, setup, burns/paralysis/sleep, recovery,
 *   Protect and Fake Out; hazards, screens and speed control get a static value.
 * - Doubles (`planDoubles`): both slots chosen together by simulating a few 2 vs 2 turns,
 *   which covers focus fire, Protect, Fake Out, Helping Hand, redirection, Tailwind,
 *   Trick Room, screens and spread moves that hit the ally.
 * - Team preview by coverage and replacements by duels.
 * Falls back to level 1 when there is nothing to simulate.
 */
import {
  type Choice,
  getSlotOptions,
  type MoveRequest,
  type SlotAction,
  type SwitchRequest,
  type TeamPreviewRequest,
  teamChoice,
} from '@colleja/core';
import { planDoubles } from '../analysis/doubles-plan';
import { pickBest } from '../analysis/evaluation';
import { duelScore, fightingForm, planSingles } from '../analysis/singles-plan';
import type { Situation } from '../analysis/situation';
import { selectByCoverage } from '../analysis/team-selection';
import { describeAction, EXPLANATION_METHODS, explanation, roundScore } from '../explain';
import type { BotLevel } from '../levels';
import { AggressiveAgent, explainContext } from './aggressive-agent';

export class TacticalAgent extends AggressiveAgent {
  override readonly name: string = 'Bot táctico';
  override readonly level: BotLevel = 2;

  /** Team preview: the group that best answers every rival species, duel by duel. */
  protected override chooseTeam(situation: Situation, request: TeamPreviewRequest): Choice {
    const picked = request.maxChosenTeamSize ?? request.side.pokemon.length;
    const foes = situation.foes.map((foe) => foe.combatant);
    const scores = situation.own.map((member) => {
      const form = fightingForm(situation, member);
      return foes.map((foe) => duelScore(situation, form, foe));
    });
    const order = selectByCoverage(scores, picked, this.random);
    return teamChoice(order.map((index) => situation.own[index]?.position ?? index + 1));
  }

  /** Replacements: the bench Pokémon that wins its duels against the rivals on the field. */
  protected override chooseReplacements(situation: Situation, request: SwitchRequest): Choice {
    const chosen = new Set<number>();
    const foes = situation.activeFoes();
    const groups: {
      slot: (typeof slots)[number];
      scored: { position: number; score: number }[];
      picked: number | null;
    }[] = [];
    const slots = getSlotOptions(request);
    const actions = slots.map((slot): SlotAction => {
      const scored = (slot.mustPass ? [] : slot.switches)
        .filter((position) => !chosen.has(position))
        .flatMap((position) => {
          const member = situation.own[position - 1];
          if (!member) return [];
          const form = fightingForm(situation, member);
          const total = foes.reduce(
            (sum, foe) => sum + duelScore(situation, form, foe.combatant),
            0,
          );
          return [{ position, score: foes.length > 0 ? total / foes.length : 0 }];
        });
      const best = pickBest(scored, this.random);
      groups.push({ slot, scored, picked: best?.position ?? null });
      if (!best) return { type: 'pass' };
      chosen.add(best.position);
      return { type: 'switch', slot: best.position };
    });
    this.explainLast = () =>
      explanation(
        'switch',
        EXPLANATION_METHODS.duels,
        groups.map(({ slot, scored, picked }) =>
          scored.map(({ position, score }) => ({
            actions: [
              describeAction(explainContext(situation), slot, { type: 'switch', slot: position }),
            ],
            score: roundScore(score),
            chosen: position === picked,
          })),
        ),
      );
    return { type: 'actions', actions };
  }

  protected override chooseMoves(situation: Situation, request: MoveRequest): Choice {
    const slots = getSlotOptions(request);
    const context = explainContext(situation);
    if (situation.doubles) {
      const plan = planDoubles(situation, slots, this.random);
      if (plan) {
        this.explainLast = () =>
          explanation('moves', EXPLANATION_METHODS.doubles, [
            plan.pairs.map((pair) => ({
              actions: pair.actions.flatMap((action, index) => {
                const slot = slots[index];
                return slot && action.type !== 'pass'
                  ? [describeAction(context, slot, action)]
                  : [];
              }),
              score: roundScore(pair.score),
              chosen: pair === plan.chosen,
            })),
          ]);
        return { type: 'actions', actions: plan.chosen.actions };
      }
    } else {
      const [slot] = slots;
      const options = slot ? planSingles(situation, slot) : null;
      const best = options ? pickBest(options, this.random) : undefined;
      if (slot && options && best) {
        this.explainLast = () =>
          explanation('moves', EXPLANATION_METHODS.singles, [
            options.map((option) => ({
              actions: [describeAction(context, slot, option.action)],
              score: roundScore(option.score),
              chosen: option === best,
            })),
          ]);
        return { type: 'actions', actions: [best.action] };
      }
    }
    return super.chooseMoves(situation, request);
  }
}
