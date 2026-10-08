/** Plays one battle of the bench. Runs in a worker thread (or inline, in tests). */
import { createBot } from '@colleja/bot';
import { type BotBattlePlayer, playBotBattle } from '@colleja/engine';
import type { BattleJob, BattleJobResult } from './types';

export async function playBenchJob(job: BattleJob): Promise<BattleJobResult> {
  // The same seeds for both versions of a pair (A/B): common random numbers.
  const team: BotBattlePlayer = {
    name: 'Equipo',
    team: job.team,
    agent: createBot(job.levels.team, { seed: `${job.seed}:team` }),
  };
  const opponent: BotBattlePlayer = {
    name: 'Rival',
    team: job.opponent,
    agent: createBot(job.levels.opponent, { seed: `${job.seed}:opponent` }),
  };
  try {
    const battle = await playBotBattle({
      mode: job.mode,
      seed: job.seed,
      options: job.options,
      p1: job.teamSide === 'p1' ? team : opponent,
      p2: job.teamSide === 'p1' ? opponent : team,
    });
    const result: BattleJobResult = {
      outcome:
        battle.winner === 'error'
          ? 'error'
          : battle.winner === null
            ? 'tie'
            : battle.winner === job.teamSide
              ? 'win'
              : 'loss',
      turns: battle.turns,
      ms: battle.ms,
      invalidChoices: battle.invalidChoices,
      decisionMs: battle.decisionMs[job.teamSide],
      decisions: battle.decisions[job.teamSide],
    };
    if (battle.error !== undefined) result.error = battle.error;
    return result;
  } catch (error) {
    return failedJob(error);
  }
}

/** A battle that could not even start or whose thread failed: an error, never a loss. */
export function failedJob(error: unknown): BattleJobResult {
  return {
    outcome: 'error',
    turns: 0,
    ms: 0,
    invalidChoices: 0,
    decisionMs: 0,
    decisions: 0,
    error: error instanceof Error ? error.message : String(error),
  };
}
