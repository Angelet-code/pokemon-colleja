/**
 * Level 3 bot, "expert": level 2 plus one turn of lookahead with the real simulator
 * (ADR-0010). When choosing moves it forks the battle under a few assumptions about the
 * rival's hidden sets, plays this turn for real against the rival's likely replies and values
 * each resulting position (`searchMoves`). Team preview and replacements are level 2's.
 * Without a sandbox (the engine offers one only while choosing moves) it plays as level 2.
 */
import { type Choice, getSlotOptions, type MoveRequest } from '@colleja/core';
import type { Situation } from '../analysis/situation';
import { describeAction, EXPLANATION_METHODS, explanation, roundScore } from '../explain';
import type { BotLevel } from '../levels';
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

  protected override chooseMoves(situation: Situation, request: MoveRequest): Choice {
    const { sandbox } = situation.context;
    if (!sandbox) return super.chooseMoves(situation, request);
    const settings = { ...SEARCH_SETTINGS[situation.mode], ...this.options.settings };
    const result = searchMoves(situation, sandbox, {
      settings,
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
