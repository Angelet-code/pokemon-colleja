import type { BattleAgent } from '@colleja/core';
import { decideFor } from '@colleja/engine';
import { describe, expect, it } from 'vitest';
import { AggressiveAgent, ExpertAgent, TacticalAgent } from '../src/index';
import { LIGHT_SEARCH, scenario, set } from './helpers';

/** Sylveon can only use Hyper Beam, so turn 2 is its recharge turn (the rivals barely hit). */
const sylveon = set('sylveon', ['hyperbeam'], {
  ability: 'pixilate',
  item: 'fairyfeather',
  nature: 'modest',
  spread: { hp: 32, spa: 32, atk: 0, def: 2 },
});
const audino = set('audino', ['protect', 'helpinghand', 'healpulse', 'dazzlinggleam']);
const audinoRival = set('audino', ['protect', 'helpinghand', 'healpulse', 'dazzlinggleam']);
const umbreon = set('umbreon', ['protect', 'foulplay', 'moonlight', 'snarl']);

const bots: [string, () => BattleAgent][] = [
  ['level 1', () => new AggressiveAgent({ seed: 'r' })],
  ['level 2', () => new TacticalAgent({ seed: 'r' })],
  ['level 3', () => new ExpertAgent({ seed: 'r', settings: LIGHT_SEARCH })],
];

describe('recharge turn', () => {
  describe.each(bots)('%s', (_name, create) => {
    it.each(['singles', 'doubles'] as const)(
      'chooses Recharge instead of passing (%s)',
      async (mode) => {
        const session = scenario(
          mode,
          mode === 'singles' ? [sylveon] : [sylveon, audino],
          mode === 'singles' ? [umbreon] : [umbreon, audinoRival],
        );
        const rival = new AggressiveAgent({ seed: 'rival' });
        // Turn 1: Hyper Beam. Turn 2: Sylveon must recharge (the only "move" of its request).
        for (let turn = 1; turn <= 2; turn++) {
          expect(session.turn).toBe(turn);
          while (session.turn === turn && !session.ended) {
            for (const side of session.pendingSides()) {
              await decideFor(session, side, side === 'p1' ? create() : rival, { maxRetries: 0 });
            }
          }
        }
        expect(session.turn).toBe(3);
      },
    );
  });
});
