import { type BattleAgent, type Choice, formatChoice, type SideId } from '@colleja/core';
import type { BattleSession } from './session';

export interface PlayOptions {
  /** Safety net against battles that never end. */
  maxDecisions?: number;
  /** Rejected choices tolerated per decision before giving up (Showdown may reveal a trap…). */
  maxRetries?: number;
  /** Called after every accepted choice. */
  onChoice?: (side: SideId, choice: Choice) => void;
}

export class AgentError extends Error {
  override name = 'AgentError';
}

/**
 * Plays the battle until it ends with an agent on each side (bot vs bot, tests, arena).
 * Returns the winner (`null` on a tie).
 */
export async function playOut(
  session: BattleSession,
  agents: Record<SideId, BattleAgent>,
  options: PlayOptions = {},
): Promise<SideId | null> {
  const maxDecisions = options.maxDecisions ?? 5000;
  const maxRetries = options.maxRetries ?? 3;
  let decisions = 0;

  while (!session.ended) {
    const pending = session.pendingSides();
    if (pending.length === 0) throw new AgentError('El combate se ha quedado sin peticiones.');
    for (const side of pending) {
      if (++decisions > maxDecisions) {
        throw new AgentError(`El combate superó ${maxDecisions} decisiones sin terminar.`);
      }
      await decide(session, side, agents[side], maxRetries, options.onChoice);
    }
  }
  return session.winner ?? null;
}

async function decide(
  session: BattleSession,
  side: SideId,
  agent: BattleAgent,
  maxRetries: number,
  onChoice: PlayOptions['onChoice'],
): Promise<void> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const context = session.getAgentContext(side);
    if (!context) return;
    const choice = await agent.choose(context);
    const result = session.choose(side, choice);
    if (result.ok) {
      onChoice?.(side, choice);
      return;
    }
    if (attempt === maxRetries) {
      throw new AgentError(
        `${agent.name} (${side}) eligió "${formatChoice(choice)}" y fue rechazada: ${result.errors.join(' ')}`,
      );
    }
  }
}
