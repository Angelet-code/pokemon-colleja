import {
  type BattleAgent,
  type Choice,
  type DecisionExplanation,
  MAX_EXPLAINED_OPTIONS,
  type SideId,
} from '@colleja/core';
import type { GameMode } from '@colleja/data';
import { BattleSession, playOut } from '@colleja/engine';
import { generateTeam } from '@colleja/teamgen';
import { describe, expect, it } from 'vitest';
import { type BotLevel, createBot, EXPLANATION_METHODS, ExpertAgent } from '../src/index';
import { LIGHT_SEARCH } from './helpers';

function newSession(mode: GameMode, seed: string): BattleSession {
  return BattleSession.create({
    mode,
    seed,
    options: { teamPreview: true, openTeamSheets: false },
    players: {
      p1: { name: 'Rival', team: generateTeam(mode, { seed: `${seed}:1` }) },
      p2: { name: 'Bot', team: generateTeam(mode, { seed: `${seed}:2` }) },
    },
  });
}

interface Decision {
  choice: Choice;
  explanation: DecisionExplanation | null;
}

/** Plays a battle; when `explain`, asks the p2 bot for an explanation after every choice. */
async function play(level: BotLevel, mode: GameMode, seed: string, explain: boolean) {
  const session = newSession(mode, seed);
  const bot =
    level === 3
      ? new ExpertAgent({ seed: `${seed}:bot`, settings: LIGHT_SEARCH })
      : createBot(level, { seed: `${seed}:bot` });
  const agents: Record<SideId, BattleAgent> = {
    p1: createBot(1, { seed: `${seed}:p1` }),
    p2: bot,
  };
  const decisions: Decision[] = [];
  await playOut(session, agents, {
    onChoice: (side, choice) => {
      if (side === 'p2' && explain)
        decisions.push({ choice, explanation: bot.explain?.() ?? null });
    },
  });
  return { inputLog: session.exportReplay().inputLog, decisions };
}

describe('bot explanations', () => {
  it.each([
    [0, 'singles'],
    [1, 'singles'],
    [2, 'singles'],
    [3, 'singles'],
    [0, 'doubles'],
    [1, 'doubles'],
    [2, 'doubles'],
    [3, 'doubles'],
  ] as const)(
    'level %i (%s) explains every turn without changing its decisions',
    async (level, mode) => {
      const seed = `explica-${level}-${mode}`;
      const plain = await play(level, mode, seed, false);
      const explained = await play(level, mode, seed, true);
      expect(explained.inputLog).toEqual(plain.inputLog);
      let anticipated = 0;

      for (const { choice, explanation } of explained.decisions) {
        if (choice.type === 'team') {
          // Only level 3 explains its team preview (what it read of both teams).
          if (level === 3) expect(explanation?.preview?.rivals.length).toBe(6);
          else expect(explanation).toBeNull();
          continue;
        }
        if (!explanation) throw new Error('sin explicación');
        expect(explanation.method.length).toBeGreaterThan(10);
        if (level === 0) expect(explanation.method).toBe(EXPLANATION_METHODS.random);
        const chosen = explanation.options.filter((option) => option.chosen);
        expect(chosen.length).toBeGreaterThan(0);
        // Best first within what is shown, and never a flood of options.
        expect(explanation.options.length).toBeLessThanOrEqual(MAX_EXPLAINED_OPTIONS * 2 + 2);
        const moves = choice.actions.filter((action) => action.type === 'move').length;
        const shownMoves = chosen
          .flatMap((option) => option.actions)
          .filter((action) => action.kind === 'move');
        expect(shownMoves.length).toBe(moves);
        for (const action of shownMoves) {
          if (action.kind === 'move') expect(action.move).toMatch(/^[a-z0-9]+$/);
        }
        const expected = explanation.expected ?? [];
        if (level !== 3 || explanation.kind !== 'moves') expect(expected).toEqual([]);
        if (expected.length > 0) anticipated++;
        const total = expected.reduce((sum, reply) => sum + reply.probability, 0);
        expect(total).toBeLessThanOrEqual(1.01);
        for (const reply of expected) {
          expect(reply.actions.length).toBeGreaterThan(0);
          for (const action of reply.actions) expect(action.user).toBeTruthy();
        }
        for (const option of explanation.options) {
          expect(option.versus?.length ?? 0).toBe(expected.length);
        }
      }
      // Level 3 says what it expected from the player whenever it searched.
      if (level === 3) expect(anticipated).toBeGreaterThan(0);
    },
  );
});
