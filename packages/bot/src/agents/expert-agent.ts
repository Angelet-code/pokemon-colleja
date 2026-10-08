/**
 * Level 3 bot, "expert": level 2 plus one turn of lookahead with the real simulator
 * (ADR-0010, ADR-0011). When choosing moves it forks the battle under a few assumptions about
 * the rival's hidden sets, plays this turn for real against the rival's likely replies and
 * values each resulting position (`searchMoves`). In singles, forced replacements go to the
 * Pokémon whose whole-team chain ends best. Team preview is level 2's. Without a sandbox (the
 * engine offers one only while choosing moves) it chooses moves as level 2.
 */
import { type Choice, getSlotOptions, type MoveRequest, type SwitchRequest } from '@colleja/core';
import { pickBest } from '../analysis/evaluation';
import { fightingForm } from '../analysis/singles-plan';
import type { Situation } from '../analysis/situation';
import { teamChainValue } from '../analysis/team-chain';
import { describeAction, EXPLANATION_METHODS, explanation, roundScore } from '../explain';
import type { BotLevel } from '../levels';
import { rivalAssumptions } from '../search/assumptions';
import { foeLineup } from '../search/lineups';
import { SEARCH_SETTINGS, type SearchSettings, searchMoves } from '../search/lookahead';
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

  constructor(private readonly options: ExpertOptions = {}) {
    super(options);
    this.replacements = new TacticalAgent({ seed: `${this.random.next()}` });
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
    const result = searchMoves(situation, sandbox, {
      settings: this.settings(situation),
      random: this.random,
      replacements: this.replacements,
    });
    if (!result) return super.chooseMoves(situation, request);
    const context = explainContext(situation);
    const slots = getSlotOptions(request);
    this.explainLast = () =>
      explanation('moves', EXPLANATION_METHODS.lookahead, [
        result.options.map((option) => ({
          actions: option.actions.flatMap((action, index) => {
            const slot = slots[index];
            return slot && action.type !== 'pass' ? [describeAction(context, slot, action)] : [];
          }),
          score: roundScore(option.score),
          chosen: option === result.chosen,
        })),
      ]);
    return { type: 'actions', actions: result.chosen.actions };
  }
}
