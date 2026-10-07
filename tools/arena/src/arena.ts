/**
 * Bot vs bot tournaments to measure the bot levels. Teams come from `@colleja/teamgen`; each
 * pair of teams is played twice, swapping which bot gets which team (and side), to cancel out
 * team bias. Everything derives from one base seed, so a run is reproducible.
 */
import { type BotLevel, createBot } from '@colleja/bot';
import type { BattleAgent, SideId } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import { BattleSession, playOut, type ReplayData } from '@colleja/engine';
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

/** Times every decision of an agent. */
class TimedAgent implements BattleAgent {
  ms = 0;
  decisions = 0;
  constructor(private readonly agent: BattleAgent) {}
  get name(): string {
    return this.agent.name;
  }
  async choose(context: Parameters<BattleAgent['choose']>[0]) {
    const start = performance.now();
    const choice = await this.agent.choose(context);
    this.ms += performance.now() - start;
    this.decisions++;
    return choice;
  }
}

export async function playArenaBattle(options: ArenaOptions, index: number): Promise<BattleRecord> {
  const { mode, seed } = options;
  const pair = Math.floor(index / 2);
  const teamX = generateTeam(mode, { seed: `${seed}:${mode}:${pair}:x` });
  const teamY = generateTeam(mode, { seed: `${seed}:${mode}:${pair}:y` });
  // Even battles: A plays team X on p1. Odd: B plays team X on p1 and A gets team Y.
  const aSide: SideId = index % 2 === 0 ? 'p1' : 'p2';
  const battleSeed = `${seed}:${mode}:${index}`;
  const a = new TimedAgent(createBot(options.a, { seed: `${battleSeed}:a` }));
  const b = new TimedAgent(createBot(options.b, { seed: `${battleSeed}:b` }));
  const agents = aSide === 'p1' ? { p1: a, p2: b } : { p1: b, p2: a };

  const session = BattleSession.create({
    mode,
    seed: battleSeed,
    options: {
      teamPreview: options.teamPreview ?? true,
      openTeamSheets: options.openTeamSheets ?? false,
    },
    players: {
      p1: { name: `Bot ${aSide === 'p1' ? 'A' : 'B'}`, team: teamX },
      p2: { name: `Bot ${aSide === 'p2' ? 'A' : 'B'}`, team: teamY },
    },
  });
  let invalidChoices = 0;
  let unavailableChoices = 0;
  session.on((event) => {
    if (event.type !== 'error') return;
    if (event.message.startsWith('[Invalid choice]')) invalidChoices++;
    else if (event.message.startsWith('[Unavailable choice]')) unavailableChoices++;
  });

  const start = performance.now();
  let outcome: BattleOutcome;
  let error: string | undefined;
  try {
    const winner = await playOut(session, agents, { maxRetries: 2 });
    outcome = winner === null ? 'tie' : winner === aSide ? 'a' : 'b';
  } catch (caught) {
    outcome = 'error';
    error = caught instanceof Error ? caught.message : String(caught);
  }
  const record: BattleRecord = {
    index,
    seed: battleSeed,
    aSide,
    outcome,
    turns: session.turn,
    ms: performance.now() - start,
    invalidChoices,
    unavailableChoices,
    decisionMs: { a: a.ms, b: b.ms },
    decisions: { a: a.decisions, b: b.decisions },
  };
  if (error) record.error = error;
  if (outcome === 'error' || invalidChoices > 0) record.replay = session.exportReplay();
  session.dispose();
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
