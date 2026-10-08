/**
 * Bot vs bot tournaments to measure the bot levels. Teams come from `@colleja/teamgen`; each
 * pair of teams is played twice, swapping which bot gets which team (and side), to cancel out
 * team bias. Everything derives from one base seed, so a run is reproducible.
 */
import { type BotLevel, createBot } from '@colleja/bot';
import type { SideId } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import { playBotBattle, type ReplayData } from '@colleja/engine';
import { generateTeam } from '@colleja/teamgen';

export interface ArenaOptions {
  /** Level of bot A (the one whose win rate is reported). */
  a: BotLevel;
  b: BotLevel;
  mode: GameMode;
  battles: number;
  seed: string;
  teamPreview?: boolean;
  openTeamSheets?: boolean;
  /** Called after every battle (progress). */
  onBattle?: (record: BattleRecord) => void;
}

export type BattleOutcome = 'a' | 'b' | 'tie' | 'error';

export interface BattleRecord {
  index: number;
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
  error?: string;
  /** Kept only for battles that failed or had invalid choices. */
  replay?: ReplayData;
}

export interface ArenaResult {
  options: Omit<ArenaOptions, 'onBattle'>;
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
  const teamX = generateTeam(mode, { seed: `${seed}:${mode}:${pair}:x` });
  const teamY = generateTeam(mode, { seed: `${seed}:${mode}:${pair}:y` });
  // Even battles: A plays team X on p1. Odd: B plays team X on p1 and A gets team Y.
  const aSide: SideId = index % 2 === 0 ? 'p1' : 'p2';
  const bSide: SideId = aSide === 'p1' ? 'p2' : 'p1';
  const battleSeed = `${seed}:${mode}:${index}`;
  const a = createBot(options.a, { seed: `${battleSeed}:a` });
  const b = createBot(options.b, { seed: `${battleSeed}:b` });
  const agents = aSide === 'p1' ? { p1: a, p2: b } : { p1: b, p2: a };

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
    seed: battleSeed,
    aSide,
    outcome,
    turns: battle.turns,
    ms: battle.ms,
    invalidChoices: battle.invalidChoices,
    unavailableChoices: battle.unavailableChoices,
    decisionMs: { a: battle.decisionMs[aSide], b: battle.decisionMs[bSide] },
    decisions: { a: battle.decisions[aSide], b: battle.decisions[bSide] },
  };
  if (battle.error !== undefined) record.error = battle.error;
  if (battle.replay) record.replay = battle.replay;
  return record;
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
  const { onBattle: _, ...rest } = options;
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
  };
}
