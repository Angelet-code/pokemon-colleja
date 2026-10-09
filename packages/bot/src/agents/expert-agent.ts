/**
 * Level 3 bot, "expert": level 2 plus one turn of lookahead with the real simulator
 * (ADR-0010, ADR-0011). When choosing moves it forks the battle under a few assumptions about
 * the rival's hidden sets, plays this turn for real against the rival's likely replies and
 * values each resulting position (`searchMoves`). In singles, forced replacements go to the
 * Pokémon whose whole-team chain ends best. Team preview is level 2's. Without a sandbox (the
 * engine offers one only while choosing moves) it chooses moves as level 2.
 */
import {
  type AgentContext,
  type Choice,
  type ExplainedAction,
  getSlotOptions,
  type MoveRequest,
  requestKind,
  type SlotAction,
  type SlotOptions,
  type SwitchRequest,
} from '@colleja/core';
import { pickBest } from '../analysis/evaluation';
import { fightingForm } from '../analysis/singles-plan';
import { Situation } from '../analysis/situation';
import { teamChainValue } from '../analysis/team-chain';
import {
  describeAction,
  EXPLANATION_METHODS,
  type ExplainContext,
  explanation,
  roundScore,
} from '../explain';
import { explainBeliefs } from '../inference/explain-beliefs';
import { COUNTER_CHANCE, RivalStyle, type StyleSummary } from '../inference/style';
import type { BotLevel } from '../levels';
import { rivalAssumptions } from '../search/assumptions';
import { foeLineup } from '../search/lineups';
import {
  SEARCH_SETTINGS,
  type SearchSettings,
  type StyleAdjustment,
  searchMoves,
} from '../search/lookahead';
import { type BotOptions, explainContext } from './aggressive-agent';
import { TacticalAgent } from './tactical-agent';

export interface ExpertOptions extends BotOptions {
  /** Search effort (defaults: `SEARCH_SETTINGS` of the mode). */
  settings?: Partial<SearchSettings>;
}

export class ExpertAgent extends TacticalAgent {
  override readonly name: string = 'Bot experto';
  override readonly level: BotLevel = 3;
  /** Level 2 deciding forced replacements inside the forks. */
  private readonly replacements: TacticalAgent;
  /** How the rival has played so far in this battle. */
  private readonly style = new RivalStyle();
  /** The situation of the decision being made (to explain its beliefs). */
  private lastSituation: Situation | null = null;

  constructor(private readonly options: ExpertOptions = {}) {
    super(options);
    this.replacements = new TacticalAgent({ seed: `${this.random.next()}` });
  }

  /**
   * Level 3 weighs the rival's sets by what it has observed (`inferBeliefs`), except when it
   * chooses moves without a sandbox (then it is level 2).
   */
  protected override situation(context: AgentContext): Situation {
    const kind = requestKind(context.request);
    const infer = kind === 'switch' || (kind === 'move' && context.sandbox !== undefined);
    const situation = new Situation(context, infer ? { beliefs: 'infer' } : {});
    this.lastSituation = situation;
    return situation;
  }

  override choose(context: AgentContext): Choice {
    this.lastSituation = null;
    const choice = super.choose(context);
    const situation = this.lastSituation as Situation | null;
    const decided = this.explainLast;
    if (situation?.beliefs && decided) {
      this.explainLast = () => ({ ...decided(), beliefs: explainBeliefs(situation) });
    }
    return choice;
  }

  private settings(situation: Situation): SearchSettings {
    return { ...SEARCH_SETTINGS[situation.mode], ...this.options.settings };
  }

  /**
   * Singles replacements: the bench Pokémon whose whole-team chain (`teamChainValue`) ends
   * best against the rival's assumed lineups (the rest of the bench behind it).
   */
  protected override chooseReplacements(situation: Situation, request: SwitchRequest): Choice {
    const [slot] = getSlotOptions(request);
    if (situation.doubles || !slot || slot.mustPass || slot.switches.length < 2) {
      return super.chooseReplacements(situation, request);
    }
    const { assumptions } = this.settings(situation);
    const lineups = rivalAssumptions(situation, assumptions, this.random).map((assumption) =>
      foeLineup(situation, assumption),
    );
    const bench = situation.bench();
    const scored = slot.switches.flatMap((position) => {
      const member = situation.own[position - 1];
      if (!member) return [];
      const own = [member, ...bench.filter((other) => other !== member)].map((other) =>
        fightingForm(situation, other),
      );
      const total = lineups.reduce((sum, foes) => sum + teamChainValue(situation, own, foes), 0);
      return [{ position, score: total / Math.max(1, lineups.length) }];
    });
    const best = pickBest(scored, this.random);
    if (!best) return super.chooseReplacements(situation, request);
    const context = explainContext(situation);
    this.explainLast = () =>
      explanation('switch', EXPLANATION_METHODS.teamChain, [
        scored.map(({ position, score }) => ({
          actions: [describeAction(context, slot, { type: 'switch', slot: position })],
          score: roundScore(score),
          chosen: position === best.position,
        })),
      ]);
    return { type: 'actions', actions: [{ type: 'switch', slot: best.position }] };
  }

  protected override chooseMoves(situation: Situation, request: MoveRequest): Choice {
    const { sandbox } = situation.context;
    if (!sandbox) return super.chooseMoves(situation, request);
    const settings = this.settings(situation);
    const style =
      settings.counterCandidates > 0
        ? styleAdjustment(this.style.summary(situation.context.log, situation.foe))
        : undefined;
    const result = searchMoves(situation, sandbox, {
      settings,
      random: this.random,
      replacements: this.replacements,
      ...(style ? { style } : {}),
    });
    if (!result) return super.chooseMoves(situation, request);
    if (result.prediction) this.style.record(situation.view.turn, result.prediction);
    const context = explainContext(situation);
    const slots = getSlotOptions(request);
    this.explainLast = () => {
      const expected = (result.expected ?? [])
        .filter((reply, index) => index === 0 || reply.probability >= MIN_EXPECTED_PROBABILITY)
        .slice(0, MAX_EXPECTED_REPLIES);
      const decided = explanation('moves', EXPLANATION_METHODS.lookahead, [
        result.options.map((option, o) => ({
          actions: describeActions(context, slots, option.actions),
          score: roundScore(option.score),
          chosen: option === result.chosen,
          ...(expected.length > 0
            ? {
                versus: expected.map((reply) => {
                  const value = reply.versus[o];
                  return value === null || value === undefined ? null : roundScore(value);
                }),
              }
            : {}),
        })),
      ]);
      if (expected.length === 0) return decided;
      return {
        ...decided,
        expected: expected.map((reply) => {
          const rival: ExplainContext = {
            request: reply.request,
            view: situation.view,
            side: situation.foe,
          };
          return {
            actions: describeActions(rival, getSlotOptions(reply.request), reply.actions),
            probability: Math.round(reply.probability * 100) / 100,
            ...(reply.counter ? { counter: true } : {}),
          };
        }),
      };
    };
    return { type: 'actions', actions: result.chosen.actions };
  }
}

/** Rival replies shown in an explanation (the likeliest ones). */
const MAX_EXPECTED_REPLIES = 4;
/** Rival replies less likely than this are not shown (the likeliest always is). */
const MIN_EXPECTED_PROBABILITY = 0.05;

/** A side's actions of one option, readable (passes left out). */
function describeActions(
  context: ExplainContext,
  slots: readonly SlotOptions[],
  list: readonly SlotAction[],
): ExplainedAction[] {
  return list.flatMap((action, index) => {
    const slot = slots[index];
    return slot && action.type !== 'pass' ? [describeAction(context, slot, action)] : [];
  });
}

/** Most a counter can weigh among the rival's replies. */
const MAX_COUNTER_WEIGHT = 0.6;

/**
 * Replies adapted to the rival's style: the more it does the obvious, the sharper (half the
 * time obvious = unchanged); the more it counters beyond chance, the more its counter weighs.
 */
export function styleAdjustment(style: StyleSummary): StyleAdjustment {
  const temperatureFactor = Math.min(2, Math.max(0.25, (1 - style.obviousRate) / 0.5));
  const beyondChance = (style.counterRate - COUNTER_CHANCE) / (1 - COUNTER_CHANCE);
  const counterWeight = Math.min(MAX_COUNTER_WEIGHT, Math.max(0, beyondChance));
  return { temperatureFactor, counterWeight };
}
