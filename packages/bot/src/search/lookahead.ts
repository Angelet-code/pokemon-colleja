/**
 * Level 3 search (ADR-0010, ADR-0011): one turn ahead with the real simulator.
 *
 * For each assumption about the rival's hidden sets, the bot forks the battle and plays this
 * turn for real with every pair (own option, likely rival reply). Each resulting position is
 * valued as the material balance plus part of the change level 2 expects from there and, in
 * singles, part of the whole-team chain (both benches). The rival's replies and their weights
 * come from level 2 playing the rival's side in the fork.
 */

import type { BattleAgent } from '@colleja/core';
import {
  type AgentContext,
  type BattleSandbox,
  type Choice,
  getSlotOptions,
  type MoveRequest,
  requestKind,
  type SandboxBattle,
  type SeededRandom,
  type SideId,
  type SlotAction,
} from '@colleja/core';
import { doublesBaseline, planDoubles } from '../analysis/doubles-plan';
import { pickBest } from '../analysis/evaluation';
import { planSingles, singlesBaseline } from '../analysis/singles-plan';
import { Situation } from '../analysis/situation';
import { teamChainValue } from '../analysis/team-chain';
import { actionKeys, type StylePrediction } from '../inference/style';
import { type Assumption, rivalAssumptions } from './assumptions';
import { forkFoeLineup, ownLineup } from './lineups';

export interface SearchSettings {
  /** Assumptions about the rival's sets (forks of the position). */
  assumptions: number;
  /** Own options searched (level 2's best ones). */
  ownOptions: number;
  /** Rival replies considered per assumption (level 2's best ones for the rival). */
  rivalReplies: number;
  /**
   * Turns played per own option and assumption. Each one draws a rival reply (stratified by
   * the replies' weights) and its own random outcomes: more turns, less noise.
   */
  turns: number;
  /** Softmax temperature over level 2's scores of the rival's replies (score points). */
  replyTemperature: number;
  /** Weight of the change level 2 expects from each resulting position (see `outlook`). */
  positionWeight: number;
  /**
   * Weight of the whole-team chain (`teamChainValue`, both benches) in each resulting
   * position, as its change from the material balance. Singles only (0 in doubles).
   */
  chainWeight: number;
  /**
   * Score points an option with a switch loses per own voluntary switch in the last 4 turns
   * (`recentSwitches`): stops two players from switching back and forth forever.
   */
  loopPenalty: number;
  /**
   * Rival replies tried against the own obvious option to find its counter (`StylePrediction`);
   * 0 turns the rival's style off.
   */
  counterCandidates: number;
}

export const SEARCH_SETTINGS: Record<'singles' | 'doubles', SearchSettings> = {
  singles: {
    assumptions: 3,
    ownOptions: 12,
    rivalReplies: 3,
    turns: 8,
    replyTemperature: 10,
    positionWeight: 0.5,
    chainWeight: 0.4,
    loopPenalty: 4,
    counterCandidates: 6,
  },
  doubles: {
    assumptions: 2,
    ownOptions: 12,
    rivalReplies: 4,
    turns: 4,
    replyTemperature: 10,
    positionWeight: 0.5,
    chainWeight: 0,
    loopPenalty: 4,
    counterCandidates: 6,
  },
};

/** Extra value of winning (or losing) the battle in the searched turn. */
const WIN_VALUE = 200;
/** Forced replacements resolved before valuing a position. */
const MAX_REPLACEMENT_ROUNDS = 3;

/** An option for this turn (one action per slot) with its value. */
export interface ScoredOption {
  actions: SlotAction[];
  score: number;
}

export interface SearchResult {
  options: ScoredOption[];
  chosen: ScoredOption;
  /** What the search expected from the rival (with `SearchTools.style`). */
  prediction?: StylePrediction;
}

/** How the rival's replies are adapted to its style (`RivalStyle`). */
export interface StyleAdjustment {
  /** Multiplies `replyTemperature`: below 1 for a rival that does the obvious. */
  temperatureFactor: number;
  /** Share of the replies' weight given to the counter of the own obvious option (0–1). */
  counterWeight: number;
}

/** Everything the search needs besides the position. */
export interface SearchTools {
  settings: SearchSettings;
  random: SeededRandom;
  /** Chooses forced replacements inside the forks (for both sides). */
  replacements: BattleAgent;
  /** Adapts the rival's replies to its style and predicts them (level 3 with a style). */
  style?: StyleAdjustment;
}

/** Options for this turn ranked by level 2, best first (`null`: nothing to plan). */
export function rankedOptions(
  situation: Situation,
  request: MoveRequest,
  random: SeededRandom,
): ScoredOption[] | null {
  const slots = getSlotOptions(request);
  let options: ScoredOption[] | null = null;
  if (situation.doubles) {
    options = planDoubles(situation, slots, random)?.pairs ?? null;
  } else {
    const [slot] = slots;
    const planned = slot ? planSingles(situation, slot) : null;
    options = planned?.map((option) => ({ actions: [option.action], score: option.score })) ?? null;
  }
  return options ? [...options].sort((a, b) => b.score - a.score) : null;
}

/** Searches this turn's options. `null` when there is nothing to search. */
export function searchMoves(
  situation: Situation,
  sandbox: BattleSandbox,
  tools: SearchTools,
): SearchResult | null {
  const { settings, random } = tools;
  const request = situation.context.request as MoveRequest;
  const own = rankedOptions(situation, request, random)?.slice(0, settings.ownOptions);
  if (!own || own.length === 0) return null;
  if (own.length === 1) return { options: own, chosen: own[0] as ScoredOption };

  const seed = String(random.int(2 ** 31));
  const totals = own.map(() => ({ sum: 0, count: 0 }));
  const assumptions = rivalAssumptions(situation, settings.assumptions, random);
  let prediction: StylePrediction | undefined;
  assumptions.forEach((assumption, a) => {
    const root = sandbox.fork(assumption, `${seed}:${a}`);
    const ranked = rankRivalReplies(situation, root, assumption, tools);
    const counter = tools.style
      ? counterReply(
          situation,
          root,
          assumption,
          own[0] as ScoredOption,
          ranked,
          tools,
          `${seed}:${a}`,
        )
      : null;
    if (a === 0 && ranked.request && ranked.options[0]) {
      prediction = {
        obvious: actionKeys(ranked.request, ranked.options[0].actions),
        counter: counter ? actionKeys(ranked.request, counter.actions) : [],
      };
    }
    const replies = replyWeights(ranked, counter, tools);
    for (let turn = 0; turn < settings.turns; turn++) {
      const reply = stratifiedPick(replies, (turn + 0.5) / settings.turns);
      own.forEach((option, o) => {
        // Same seed and reply for every own option: fairer comparisons.
        const leaf = root.clone(`${seed}:${a}:${turn}`);
        if (!leaf.choose(situation.me, actions(option.actions))) return;
        if (!reply.choice || !leaf.choose(situation.foe, reply.choice)) {
          leaf.chooseDefault(situation.foe);
        }
        const total = totals[o] as { sum: number; count: number };
        total.sum += positionValue(situation, leaf, assumption, tools);
        total.count++;
      });
    }
  });

  const loop = settings.loopPenalty * recentSwitches(situation.context.log, situation.me, 4);
  const options = own.flatMap((option, o) => {
    const total = totals[o] as { sum: number; count: number };
    if (total.count === 0) return [];
    const switches = option.actions.some((action) => action.type === 'switch');
    return [{ actions: option.actions, score: total.sum / total.count - (switches ? loop : 0) }];
  });
  const chosen = pickBest(options, random);
  const result = chosen ? { options, chosen } : { options: own, chosen: own[0] as ScoredOption };
  return prediction ? { ...result, prediction } : result;
}

interface Reply {
  /** `null`: let the simulator choose (nothing to plan). */
  choice: Choice | null;
  weight: number;
}

/** The rival's options in a fork as level 2 ranks them from its side (best first). */
interface RankedReplies {
  /** The rival's request in the fork (`null`: it has nothing to plan). */
  request: MoveRequest | null;
  options: ScoredOption[];
}

function rankRivalReplies(
  situation: Situation,
  root: SandboxBattle,
  assumption: Assumption,
  tools: SearchTools,
): RankedReplies {
  const request = root.request(situation.foe);
  if (!request || requestKind(request) !== 'move') return { request: null, options: [] };
  const rival = new Situation(rivalContext(situation, request, [], assumption));
  const count = Math.max(
    tools.settings.rivalReplies,
    tools.style ? tools.settings.counterCandidates : 0,
  );
  const ranked = rankedOptions(rival, request as MoveRequest, tools.random)?.slice(0, count) ?? [];
  return { request: request as MoveRequest, options: ranked };
}

/**
 * The rival's reply that does best against the own obvious option (level 2's best), among its
 * best `counterCandidates`: one turn played for each.
 */
function counterReply(
  situation: Situation,
  root: SandboxBattle,
  assumption: Assumption,
  obvious: ScoredOption,
  ranked: RankedReplies,
  tools: SearchTools,
  seed: string,
): ScoredOption | null {
  let counter: ScoredOption | null = null;
  let lowest = Infinity;
  ranked.options.slice(0, tools.settings.counterCandidates).forEach((reply, r) => {
    const leaf = root.clone(`${seed}:counter:${r}`);
    if (!leaf.choose(situation.me, actions(obvious.actions))) return;
    if (!leaf.choose(situation.foe, actions(reply.actions))) return;
    const value = positionValue(situation, leaf, assumption, tools);
    if (value < lowest) {
      lowest = value;
      counter = reply;
    }
  });
  return counter;
}

/**
 * The rival's likely replies: level 2's best ones weighted by score (softmax, sharper for a
 * rival that does the obvious) plus, for a rival that counters, its counter.
 */
function replyWeights(
  ranked: RankedReplies,
  counter: ScoredOption | null,
  tools: SearchTools,
): Reply[] {
  const options = ranked.options.slice(0, tools.settings.rivalReplies);
  const top = options[0];
  if (!top) return [{ choice: null, weight: 1 }];
  const temperature = tools.settings.replyTemperature * (tools.style?.temperatureFactor ?? 1);
  const raw = options.map((option) => Math.exp((option.score - top.score) / temperature));
  const sum = raw.reduce((total, weight) => total + weight, 0);
  const countered = counter ? (tools.style?.counterWeight ?? 0) : 0;
  const replies = options.map((option, i) => ({
    choice: actions(option.actions),
    weight: ((raw[i] ?? 0) / sum) * (1 - countered),
    option,
  }));
  if (counter && countered > 0) {
    const same = replies.find((reply) => reply.option === counter);
    if (same) same.weight += countered;
    else replies.push({ choice: actions(counter.actions), weight: countered, option: counter });
  }
  return replies.map(({ choice, weight }) => ({ choice, weight }));
}

/**
 * Voluntary switches of `side` in the last `turns` turns of `log` (replacements after one of
 * its Pokémon fainted do not count): how long it has been switching back and forth.
 */
export function recentSwitches(log: readonly string[], side: SideId, turns: number): number {
  // Leads are sent out before turn 1: not switches.
  let start = Math.max(
    0,
    log.findIndex((line) => line.startsWith('|turn|')),
  );
  let seen = 0;
  for (let i = log.length - 1; i >= 0; i--) {
    if (!log[i]?.startsWith('|turn|')) continue;
    if (++seen > turns) {
      start = i + 1;
      break;
    }
  }
  let fainted = 0;
  let switches = 0;
  for (let i = start; i < log.length; i++) {
    const [, type, ident = ''] = (log[i] as string).split('|');
    if (!ident.startsWith(side)) continue;
    if (type === 'faint') fainted++;
    else if (type === 'switch') {
      if (fainted > 0) fainted--;
      else switches++;
    }
  }
  return switches;
}

/** The reply at cumulative weight `quantile` (0–1). */
function stratifiedPick(replies: readonly Reply[], quantile: number): Reply {
  let cumulative = 0;
  for (const reply of replies) {
    cumulative += reply.weight;
    if (quantile < cumulative) return reply;
  }
  return replies.at(-1) as Reply;
}

/**
 * Value of a fork after the searched turn, for the searching side: forced replacements are
 * made first (level 2 for both sides), then material balance (× 100) plus part of the change
 * level 2 expects from there.
 */
function positionValue(
  situation: Situation,
  leaf: SandboxBattle,
  assumption: Assumption,
  tools: SearchTools,
): number {
  const { me, foe } = situation;
  for (let round = 0; round < MAX_REPLACEMENT_ROUNDS && !leaf.ended; round++) {
    const mine = leaf.request(me);
    if (mine && requestKind(mine) === 'move') break;
    let acted = false;
    for (const side of [me, foe]) {
      const request = leaf.request(side);
      if (!request) continue;
      const context =
        side === me
          ? ownContext(situation, request, leaf.log(me))
          : rivalContext(situation, request, leaf.log(me), assumption);
      const choice = tools.replacements.choose(context) as Choice;
      if (!leaf.choose(side, choice)) leaf.chooseDefault(side);
      acted = true;
    }
    if (!acted) break;
  }

  const material = (share(leaf, me) - share(leaf, foe)) * 100;
  if (leaf.ended) {
    const winner = leaf.winner;
    return material + (winner === me ? WIN_VALUE : winner === foe ? -WIN_VALUE : 0);
  }
  const request = leaf.request(me);
  if (!request || requestKind(request) !== 'move') return material;
  const next = new Situation(ownContext(situation, request, leaf.log(me)));
  const { positionWeight, chainWeight } = tools.settings;
  let value = material;
  if (positionWeight > 0) {
    value += positionWeight * outlook(next, request as MoveRequest, tools);
  }
  if (chainWeight > 0 && !next.doubles) {
    const chain = teamChainValue(next, ownLineup(next), forkFoeLineup(next, leaf, assumption));
    value += chainWeight * (chain - material);
  }
  return value;
}

/**
 * Change in material that level 2 expects from a position: its best option's score minus
 * what that score would be if nothing happened (both count only some Pokémon, so adding the
 * raw score to the whole-team balance would count those twice).
 */
function outlook(situation: Situation, request: MoveRequest, tools: SearchTools): number {
  const best = rankedOptions(situation, request, tools.random)?.[0];
  if (!best) return 0;
  if (situation.doubles) return best.score - doublesBaseline(situation);
  const [slot] = getSlotOptions(request);
  return slot ? best.score - singlesBaseline(situation, slot) : 0;
}

/** The searching side in a fork (without a sandbox: forks are not forked again). */
function ownContext(
  situation: Situation,
  request: AgentContext['request'],
  extraLog: readonly string[],
): AgentContext {
  const { sandbox: _, ...context } = situation.context;
  return { ...context, request, log: [...context.log, ...extraLog] };
}

/** What the rival would know in a fork: its assumed team and the same board. */
function rivalContext(
  situation: Situation,
  request: AgentContext['request'],
  extraLog: readonly string[],
  assumption: Assumption,
): AgentContext {
  const { context } = situation;
  return {
    side: situation.foe,
    mode: context.mode,
    request,
    log: [...context.log, ...extraLog],
    team: assumption.team,
    opponentTeam: context.opponentTeam ? context.team : null,
  };
}

/** Sum of HP shares of a side's brought Pokémon. */
function share(battle: SandboxBattle, side: SideId): number {
  return battle
    .pokemon(side)
    .reduce((sum, pokemon) => sum + (pokemon.maxhp > 0 ? pokemon.hp / pokemon.maxhp : 0), 0);
}

function actions(list: SlotAction[]): Choice {
  return { type: 'actions', actions: list };
}
