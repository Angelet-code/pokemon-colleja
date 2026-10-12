/**
 * Fixed lineups for the arena's measuring mode (`--fixed`, fase 17): each team brings a fixed
 * group (4 in doubles, 3 in singles) with a random lead drawn from the seed, so a mirrored pair
 * of battles only differs in who plays each team. The wrapper answers team preview with that
 * lineup and leaves every other decision to the bot, untouched.
 */
import {
  type AgentContext,
  type BattleAgent,
  type Choice,
  type DecisionExplanation,
  requestKind,
  SeededRandom,
  teamChoice,
} from '@colleja/core';
import type { GameMode } from '@colleja/data';

/** Pokémon brought and leads per side in each mode. */
export const FIXED_SIZE: Record<GameMode, { brought: number; leads: number }> = {
  singles: { brought: 3, leads: 1 },
  doubles: { brought: 4, leads: 2 },
};

/**
 * The lineup of a team of `size` members: team positions (1-based) in order, leads first.
 * A seeded shuffle: the same seed always gives the same group and lead.
 */
export function fixedLineup(mode: GameMode, size: number, seed: string): number[] {
  const random = new SeededRandom(seed);
  const positions = Array.from({ length: size }, (_, i) => i + 1);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = random.int(i + 1);
    [positions[i], positions[j]] = [positions[j] as number, positions[i] as number];
  }
  return positions.slice(0, Math.min(size, FIXED_SIZE[mode].brought));
}

/** A bot that brings a fixed lineup at team preview and decides everything else itself. */
export class FixedLineupAgent implements BattleAgent {
  readonly name: string;
  private delegated = false;

  constructor(
    private readonly inner: BattleAgent,
    readonly order: readonly number[],
  ) {
    this.name = inner.name;
  }

  choose(context: AgentContext): Choice | Promise<Choice> {
    this.delegated = requestKind(context.request) !== 'team';
    return this.delegated ? this.inner.choose(context) : teamChoice([...this.order]);
  }

  explain(): DecisionExplanation | null {
    return this.delegated ? (this.inner.explain?.() ?? null) : null;
  }
}
