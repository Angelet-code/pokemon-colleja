/**
 * One battle between two agents, from creation to the end, with its metrics. Shared by the
 * arena (random teams) and the team bench (saved teams): the agents come already built, so
 * the engine only needs the `BattleAgent` interface of core (it cannot depend on the bot).
 */
import type { BattleAgent, BattleOptions, PokemonSet, SideId } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import type { ReplayData } from './replay';
import { playOut } from './runner';
import { BattleSession } from './session';

export interface BotBattlePlayer {
  team: PokemonSet[];
  agent: BattleAgent;
  /** Shown in the log and the replay. Default: the agent's name. */
  name?: string;
}

export interface BotBattleConfig {
  mode: GameMode;
  /** Battle seed (any text: `toBattleSeed` turns it into a Showdown seed). */
  seed: string;
  options?: Partial<BattleOptions>;
  p1: BotBattlePlayer;
  p2: BotBattlePlayer;
  /** Rejected choices tolerated per decision (default 2, like the arena). */
  maxRetries?: number;
}

export interface BotBattleResult {
  /** `null` on a tie; `'error'` when the battle could not be finished (a bot or engine bug). */
  winner: SideId | null | 'error';
  turns: number;
  ms: number;
  /** `[Invalid choice]` rejections: always a bot bug. */
  invalidChoices: number;
  /** `[Unavailable choice]` rejections: legitimate (hidden information). */
  unavailableChoices: number;
  /** Time spent deciding and number of decisions, per side. */
  decisionMs: Record<SideId, number>;
  decisions: Record<SideId, number>;
  error?: string;
  /** Kept only for battles that failed or had invalid choices (to reproduce them). */
  replay?: ReplayData;
}

/** Times every decision of an agent. */
export class TimedAgent implements BattleAgent {
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

/** Plays a whole battle between two agents. Never throws for a battle that breaks midway. */
export async function playBotBattle(config: BotBattleConfig): Promise<BotBattleResult> {
  const p1 = new TimedAgent(config.p1.agent);
  const p2 = new TimedAgent(config.p2.agent);
  const session = BattleSession.create({
    mode: config.mode,
    seed: config.seed,
    options: {
      teamPreview: config.options?.teamPreview ?? true,
      openTeamSheets: config.options?.openTeamSheets ?? false,
    },
    players: {
      p1: { name: config.p1.name ?? p1.name, team: config.p1.team },
      p2: { name: config.p2.name ?? p2.name, team: config.p2.team },
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
  let winner: BotBattleResult['winner'];
  let error: string | undefined;
  try {
    winner = await playOut(session, { p1, p2 }, { maxRetries: config.maxRetries ?? 2 });
  } catch (caught) {
    winner = 'error';
    error = caught instanceof Error ? caught.message : String(caught);
  }
  const result: BotBattleResult = {
    winner,
    turns: session.turn,
    ms: performance.now() - start,
    invalidChoices,
    unavailableChoices,
    decisionMs: { p1: p1.ms, p2: p2.ms },
    decisions: { p1: p1.decisions, p2: p2.decisions },
  };
  if (error !== undefined) result.error = error;
  if (winner === 'error' || invalidChoices > 0) result.replay = session.exportReplay();
  session.dispose();
  return result;
}
