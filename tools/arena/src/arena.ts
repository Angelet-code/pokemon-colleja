/**
 * Bot vs bot tournaments to measure the bot levels. Teams come from `@colleja/teamgen` or from
 * a fixed pool (`teams`, e.g. the saved rivals); each pair of teams is played twice, swapping
 * which bot gets which team (and side), to cancel out team bias. Everything derives from one
 * base seed, so a run is reproducible.
 *
 * Measuring mode (`fixed`, fase 17): each team brings a fixed group with a random lead
 * (`fixedLineup`), the same in both battles of the pair, and both battles share the battle
 * seed. A pair is then a mirror: same teams, same leads, same luck stream, only the bots swap.
 *
 * With `fixedGroup` (fase 21) the groups are fixed the same way but each bot chooses who leads
 * among its four (`leads.a`/`leads.b`: `bot`) or leads at random like `fixed` (`random`): a
 * mirrored pair then measures the leads (and the play).
 */
import {
  type BotLevel,
  createBot,
  SEARCH_SETTINGS,
  type SearchSettings,
  type SetPriors,
} from '@colleja/bot';
import { type PokemonSet, SeededRandom, type SideId } from '@colleja/core';
import { type GameMode, toId } from '@colleja/data';
import { playBotBattle, type ReplayData } from '@colleja/engine';
import { generateTeam } from '@colleja/teamgen';
import { FixedLineupAgent, fixedLineup } from './fixed-lineup';

export interface ArenaOptions {
  /** Level of bot A (the one whose win rate is reported). */
  a: BotLevel;
  b: BotLevel;
  mode: GameMode;
  battles: number;
  seed: string;
  teamPreview?: boolean;
  openTeamSheets?: boolean;
  /**
   * Teams to draw each pair from (two different ones per pair) instead of random teams. They
   * must be legal in `mode`.
   */
  teams?: readonly PokemonSet[][];
  /** Measuring mode: fixed groups with random leads, each pair a mirror (see above). */
  fixed?: boolean;
  /** Measuring mode with fixed groups whose leads each bot chooses (see above). */
  fixedGroup?: boolean;
  /** With `fixedGroup`: who chooses each bot's leads (default: the bot). */
  leads?: { a?: LeadPolicy; b?: LeadPolicy };
  /** Search settings of bot A (level 3), over `SEARCH_SETTINGS`: to measure a variant. */
  aSettings?: Partial<SearchSettings>;
  /** The sets each bot assumes for its rival first (fase 22; default: the standard sets). */
  setPriors?: { a?: SetPriors; b?: SetPriors };
  /** With `setPriors`: bot A's share of the prior left to the standard sets (a variant). */
  aStandardShare?: number;
  /**
   * Fixed modes: bot A knows which species bot B brought (not their sets), the ceiling of
   * predicting it (fase 23, `BotOptions.rivalBrought`).
   */
  aOracle?: boolean;
  /** Called after every battle (progress). */
  onBattle?: (record: BattleRecord) => void;
}

export type BattleOutcome = 'a' | 'b' | 'tie' | 'error';

/** Who decides the leads within a fixed group: the bot itself or a seeded draw. */
export type LeadPolicy = 'bot' | 'random';

export interface BattleRecord {
  index: number;
  /** The pair of teams (two battles each, bots swapped). */
  pair: number;
  /** Fixed modes: species each bot brought (leads first when drawn at random). */
  lineups?: { a: string[]; b: string[] };
  seed: string;
  /** Side bot A played on. */
  aSide: SideId;
  outcome: BattleOutcome;
  turns: number;
  ms: number;
  /** `[Invalid choice]` rejections: always a bot bug. */
  invalidChoices: number;
  /** `[Unavailable choice]` rejections: legitimate (hidden information). */
  unavailableChoices: number;
  /** Time spent deciding, per bot. */
  decisionMs: { a: number; b: number };
  decisions: { a: number; b: number };
  /** Hash of the input log (`BotBattleResult.fingerprint`). */
  fingerprint: string;
  error?: string;
  /** Kept only for battles that failed or had invalid choices. */
  replay?: ReplayData;
}

export interface ArenaResult {
  options: Omit<ArenaOptions, 'onBattle' | 'teams' | 'setPriors'>;
  battles: number;
  wins: { a: number; b: number; tie: number; error: number };
  /** Bot A's win rate over finished battles (ties count half). */
  winRate: number;
  /** Approximate 95 % interval for the win rate (Wilson). */
  interval: [number, number];
  avgTurns: number;
  avgMs: number;
  /** Average milliseconds per decision of each bot. */
  avgDecisionMs: { a: number; b: number };
  invalidChoices: number;
  unavailableChoices: number;
  /** Battles that errored or had invalid choices, with their replays. */
  failures: BattleRecord[];
  /** Per pair of teams (both battles finished): what a mirror measures. */
  pairs: PairSummary;
}

export interface PairSummary {
  /** Pairs with both battles finished. */
  count: number;
  /** Bot A won both battles (with either team), split them, or lost both. */
  sweepsA: number;
  splits: number;
  sweepsB: number;
  /** Bot A's points per pair (0–1), averaged, and its 95 % interval from the pairs' spread. */
  winRate: number;
  interval: [number, number];
}

/**
 * `--a-settings` (fase 19): a JSON object of numeric search settings, e.g.
 * `{"learnedWeight":1,"positionWeight":0}`. Unknown keys are an error.
 */
export function parseSearchSettings(text: string): Partial<SearchSettings> {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('--a-settings debe ser un objeto JSON.');
  }
  const known = Object.keys(SEARCH_SETTINGS.doubles);
  const settings: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!known.includes(key)) throw new Error(`--a-settings: opción desconocida "${key}".`);
    if (typeof value !== 'number') throw new Error(`--a-settings: "${key}" debe ser un número.`);
    settings[key] = value;
  }
  return settings as Partial<SearchSettings>;
}

/** Wilson score interval for `successes` out of `total` (95 %). */
export function wilsonInterval(successes: number, total: number, z = 1.96): [number, number] {
  if (total === 0) return [0, 1];
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

export async function playArenaBattle(options: ArenaOptions, index: number): Promise<BattleRecord> {
  const { mode, seed } = options;
  const pair = Math.floor(index / 2);
  const [teamX, teamY] = pairTeams(options, pair);
  // Even battles: A plays team X on p1. Odd: B plays team X on p1 and A gets team Y.
  const aSide: SideId = index % 2 === 0 ? 'p1' : 'p2';
  const bSide: SideId = aSide === 'p1' ? 'p2' : 'p1';
  // A mirror shares the luck stream: both battles of the pair use the same battle seed.
  const mirrored = options.fixed || options.fixedGroup;
  const battleSeed = mirrored ? `${seed}:${mode}:fixed:${pair}` : `${seed}:${mode}:${index}`;
  const botSeed = `${seed}:${mode}:${index}`;
  // The same groups (and drawn leads) for a pair, whatever the mode.
  const x = mirrored ? fixedLineup(mode, teamX.length, `${seed}:${mode}:${pair}:x:lineup`) : [];
  const y = mirrored ? fixedLineup(mode, teamY.length, `${seed}:${mode}:${pair}:y:lineup`) : [];
  const groupOf = (bot: 'a' | 'b') => ((bot === 'a') === (aSide === 'p1') ? x : y);
  // Levels 0 and 1 do not choose within a group (`BotOptions.fixedGroup`): their leads are drawn.
  const policy = (bot: 'a' | 'b'): LeadPolicy | null => {
    if (options.fixed) return 'random';
    if (!options.fixedGroup) return null;
    const level = bot === 'a' ? options.a : options.b;
    return level < 2 ? 'random' : (options.leads?.[bot] ?? 'bot');
  };
  const teamOf = (bot: 'a' | 'b') => ((bot === 'a') === (aSide === 'p1') ? teamX : teamY);
  const brought = (bot: 'a' | 'b') =>
    groupOf(bot).map((position) => toId(teamOf(bot)[position - 1]?.species ?? ''));
  if (options.aOracle && !mirrored) throw new Error('aOracle needs a fixed mode.');
  const make = (bot: 'a' | 'b') => {
    const own = policy(bot) === 'bot' ? { fixedGroup: groupOf(bot) } : {};
    const agent = createBot(bot === 'a' ? options.a : options.b, {
      seed: `${botSeed}:${bot}`,
      ...own,
      ...(bot === 'a' && options.aSettings ? { settings: options.aSettings } : {}),
      ...(options.setPriors?.[bot] ? { setPriors: options.setPriors[bot] } : {}),
      ...(bot === 'a' && options.aStandardShare !== undefined
        ? { standardShare: options.aStandardShare }
        : {}),
      ...(bot === 'a' && options.aOracle ? { rivalBrought: brought('b') } : {}),
    });
    return policy(bot) === 'random' ? new FixedLineupAgent(agent, groupOf(bot)) : agent;
  };
  const a = make('a');
  const b = make('b');
  const agents = aSide === 'p1' ? { p1: a, p2: b } : { p1: b, p2: a };
  let lineups: BattleRecord['lineups'];
  if (mirrored) {
    const species = (team: PokemonSet[], order: number[]) =>
      order.map((position) => team[position - 1]?.species ?? '');
    const p1 = species(teamX, x);
    const p2 = species(teamY, y);
    lineups = aSide === 'p1' ? { a: p1, b: p2 } : { a: p2, b: p1 };
  }

  const battle = await playBotBattle({
    mode,
    seed: battleSeed,
    options: {
      teamPreview: options.teamPreview ?? true,
      openTeamSheets: options.openTeamSheets ?? false,
    },
    p1: { name: `Bot ${aSide === 'p1' ? 'A' : 'B'}`, team: teamX, agent: agents.p1 },
    p2: { name: `Bot ${aSide === 'p2' ? 'A' : 'B'}`, team: teamY, agent: agents.p2 },
  });
  const outcome: BattleOutcome =
    battle.winner === 'error'
      ? 'error'
      : battle.winner === null
        ? 'tie'
        : battle.winner === aSide
          ? 'a'
          : 'b';
  const record: BattleRecord = {
    index,
    pair,
    ...(lineups ? { lineups } : {}),
    seed: battleSeed,
    aSide,
    outcome,
    turns: battle.turns,
    ms: battle.ms,
    invalidChoices: battle.invalidChoices,
    unavailableChoices: battle.unavailableChoices,
    decisionMs: { a: battle.decisionMs[aSide], b: battle.decisionMs[bSide] },
    decisions: { a: battle.decisions[aSide], b: battle.decisions[bSide] },
    fingerprint: battle.fingerprint,
  };
  if (battle.error !== undefined) record.error = battle.error;
  if (battle.replay) record.replay = battle.replay;
  return record;
}

/** The two teams of a pair: random ones, or two different ones drawn from the pool. */
export function pairTeams(options: ArenaOptions, pair: number): [PokemonSet[], PokemonSet[]] {
  const { mode, seed, teams } = options;
  if (!teams) {
    return [
      generateTeam(mode, { seed: `${seed}:${mode}:${pair}:x` }),
      generateTeam(mode, { seed: `${seed}:${mode}:${pair}:y` }),
    ];
  }
  if (teams.length < 2) throw new Error('The team pool needs at least two teams.');
  const random = new SeededRandom(`${seed}:${mode}:${pair}:pool`);
  const x = random.int(teams.length);
  const y = (x + 1 + random.int(teams.length - 1)) % teams.length;
  return [teams[x] as PokemonSet[], teams[y] as PokemonSet[]];
}

export async function runArena(options: ArenaOptions): Promise<ArenaResult> {
  const records: BattleRecord[] = [];
  for (let index = 0; index < options.battles; index++) {
    const record = await playArenaBattle(options, index);
    records.push(record);
    options.onBattle?.(record);
  }
  return summarize(options, records);
}

export function summarize(options: ArenaOptions, records: readonly BattleRecord[]): ArenaResult {
  const wins = { a: 0, b: 0, tie: 0, error: 0 };
  for (const record of records) wins[record.outcome]++;
  const finished = records.filter((record) => record.outcome !== 'error');
  const points = wins.a + wins.tie / 2;
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const decisions = {
    a: sum(records.map((record) => record.decisions.a)),
    b: sum(records.map((record) => record.decisions.b)),
  };
  const { onBattle: _, teams: _teams, setPriors: _priors, ...rest } = options;
  return {
    options: rest,
    battles: records.length,
    wins,
    winRate: finished.length > 0 ? points / finished.length : 0,
    interval: wilsonInterval(points, finished.length),
    avgTurns:
      finished.length > 0 ? sum(finished.map((record) => record.turns)) / finished.length : 0,
    avgMs: records.length > 0 ? sum(records.map((record) => record.ms)) / records.length : 0,
    avgDecisionMs: {
      a: decisions.a > 0 ? sum(records.map((record) => record.decisionMs.a)) / decisions.a : 0,
      b: decisions.b > 0 ? sum(records.map((record) => record.decisionMs.b)) / decisions.b : 0,
    },
    invalidChoices: sum(records.map((record) => record.invalidChoices)),
    unavailableChoices: sum(records.map((record) => record.unavailableChoices)),
    failures: records.filter((record) => record.outcome === 'error' || record.invalidChoices > 0),
    pairs: summarizePairs(records),
  };
}

const POINTS: Record<Exclude<BattleOutcome, 'error'>, number> = { a: 1, tie: 0.5, b: 0 };

/**
 * Bot A's result per pair of teams (pairs with an errored battle left out). The interval comes
 * from the spread of the pair scores, so it shrinks when the mirror cancels the teams' and the
 * leads' bias.
 */
export function summarizePairs(records: readonly BattleRecord[]): PairSummary {
  const byPair = new Map<number, BattleRecord[]>();
  for (const record of records)
    byPair.set(record.pair, [...(byPair.get(record.pair) ?? []), record]);
  const scores: number[] = [];
  for (const battles of byPair.values()) {
    if (battles.length !== 2 || battles.some((record) => record.outcome === 'error')) continue;
    const points = battles.map((record) => POINTS[record.outcome as keyof typeof POINTS]);
    scores.push((points[0] ?? 0) / 2 + (points[1] ?? 0) / 2);
  }
  const count = scores.length;
  const mean = count > 0 ? scores.reduce((sum, value) => sum + value, 0) / count : 0;
  const variance =
    count > 1 ? scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1) : 0;
  const margin = count > 0 ? 1.96 * Math.sqrt(variance / count) : 1;
  return {
    count,
    sweepsA: scores.filter((score) => score === 1).length,
    splits: scores.filter((score) => score > 0 && score < 1).length,
    sweepsB: scores.filter((score) => score === 0).length,
    winRate: mean,
    interval: [Math.max(0, mean - margin), Math.min(1, mean + margin)],
  };
}
