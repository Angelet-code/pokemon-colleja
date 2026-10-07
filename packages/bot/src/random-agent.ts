/**
 * Level 0 bot: picks uniformly among legal actions. Typed port of Showdown's `RandomPlayerAI`
 * built on `@colleja/core` (team preview, forced switches, doubles targets and Mega Evolution).
 */
import {
  type ActionableRequest,
  type AgentContext,
  type BattleAgent,
  BattleView,
  type Choice,
  type DecisionExplanation,
  getSlotOptions,
  isFainted,
  type MoveOption,
  type MoveRequest,
  PASS,
  requestKind,
  SeededRandom,
  type SlotAction,
  type SlotOptions,
  type SwitchRequest,
  type TeamPreviewRequest,
} from '@colleja/core';
import { describeAction, EXPLANATION_METHODS, explanation } from './explain';

export interface RandomAgentOptions {
  /** Same seed → same decisions for the same requests. */
  seed?: string;
  /** Probability of attacking instead of switching when both are possible. */
  moveChance?: number;
  /** Probability of Mega Evolving when possible. */
  megaChance?: number;
}

export class RandomAgent implements BattleAgent {
  readonly name: string = 'Bot aleatorio';
  readonly level = 0;
  private readonly random: SeededRandom;
  private readonly moveChance: number;
  private readonly megaChance: number;
  private explainLast: (() => DecisionExplanation) | null = null;

  constructor(options: RandomAgentOptions = {}) {
    this.random = new SeededRandom(options.seed ?? String(Math.random()));
    this.moveChance = options.moveChance ?? 0.8;
    this.megaChance = options.megaChance ?? 0.6;
  }

  choose(context: AgentContext): Choice {
    this.explainLast = null;
    const choice = this.chooseFor(context.request);
    const { request } = context;
    if (choice.type === 'actions') {
      this.explainLast = () => {
        const explainContext = {
          request,
          view: BattleView.from(context.log),
          side: context.side,
        };
        const slots = getSlotOptions(request as MoveRequest | SwitchRequest);
        return explanation(
          requestKind(request) === 'switch' ? 'switch' : 'moves',
          EXPLANATION_METHODS.random,
          [
            [
              {
                actions: choice.actions.flatMap((action, index) => {
                  const slot = slots[index];
                  return slot ? [describeAction(explainContext, slot, action)] : [];
                }),
                score: 0,
                chosen: true,
              },
            ],
          ],
        );
      };
    }
    return choice;
  }

  explain(): DecisionExplanation | null {
    return this.explainLast?.() ?? null;
  }

  chooseFor(request: ActionableRequest): Choice {
    if (requestKind(request) === 'team') return this.chooseTeam(request as TeamPreviewRequest);
    return this.chooseActions(request as MoveRequest | SwitchRequest);
  }

  private chooseTeam(request: TeamPreviewRequest): Choice {
    const size = request.side.pokemon.length;
    const picked = request.maxChosenTeamSize ?? size;
    const positions = Array.from({ length: size }, (_, i) => i + 1);
    return { type: 'team', order: this.random.shuffle(positions).slice(0, picked) };
  }

  private chooseActions(request: MoveRequest | SwitchRequest): Choice {
    const chosenSwitches = new Set<number>();
    let megaAvailable = true;
    const actions = getSlotOptions(request).map((slot): SlotAction => {
      if (slot.mustPass) return PASS;
      const switches = slot.switches.filter((position) => !chosenSwitches.has(position));
      const moves = slot.moves.filter((move) => !move.disabled);
      const usefulMoves = moves.filter(
        (move) => move.targets.length === 0 || this.usefulTargets(request, slot, move).length > 0,
      );

      const wantsSwitch = moves.length === 0 || !this.random.chance(this.moveChance);
      if (switches.length > 0 && wantsSwitch) {
        const position = this.random.pick(switches);
        chosenSwitches.add(position);
        return { type: 'switch', slot: position };
      }
      if (moves.length === 0) return PASS; // forced switch with no replacement left

      const move = this.random.pick(usefulMoves.length > 0 ? usefulMoves : moves);
      const action: SlotAction = { type: 'move', move: move.slot };
      if (move.targets.length > 0) {
        const targets = this.usefulTargets(request, slot, move);
        action.target = this.random.pick(targets.length > 0 ? targets : move.targets);
      }
      if (slot.canMega && megaAvailable && this.random.chance(this.megaChance)) {
        action.mega = true;
        megaAvailable = false;
      }
      return action;
    });
    return { type: 'actions', actions };
  }

  /**
   * Sensible targets: rivals for attacks, and only living allies for ally-targeted moves.
   */
  private usefulTargets(
    request: MoveRequest | SwitchRequest,
    slot: SlotOptions,
    move: MoveOption,
  ): number[] {
    const foes = move.targets.filter((target) => target > 0);
    if (foes.length > 0) return foes;
    return move.targets.filter((target) => {
      const ally = request.side.pokemon[-target - 1];
      return -target - 1 === slot.index || (ally !== undefined && !isFainted(ally));
    });
  }
}
