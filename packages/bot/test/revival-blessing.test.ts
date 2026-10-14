import { type BattleAgent, getSlotOptions, type SwitchRequest } from '@colleja/core';
import { decideFor } from '@colleja/engine';
import { describe, expect, it } from 'vitest';
import { AggressiveAgent, ExpertAgent, RandomAgent, TacticalAgent } from '../src/index';
import { LIGHT_SEARCH, scenario, set } from './helpers';

/**
 * Whimsicott (Prankster Memento) faints first; then Pawmot uses Revival Blessing and Showdown
 * asks it, with a switch-style request, which fainted ally to bring back.
 */
const whimsicott = set('whimsicott', ['memento'], { ability: 'prankster' });
const pawmot = set('pawmot', ['revivalblessing']);
const audino = set('audino', ['helpinghand']);
const umbreon = set('umbreon', ['protect']);

const bots: [string, () => BattleAgent][] = [
  ['level 0', () => new RandomAgent({ seed: 'r' })],
  ['level 1', () => new AggressiveAgent({ seed: 'r' })],
  ['level 2', () => new TacticalAgent({ seed: 'r' })],
  ['level 3', () => new ExpertAgent({ seed: 'r', settings: LIGHT_SEARCH })],
];

describe('Revival Blessing', () => {
  describe.each(bots)('%s', (_name, create) => {
    it.each(['singles', 'doubles'] as const)(
      'revives the fainted ally instead of passing (%s)',
      async (mode) => {
        const doubles = mode === 'doubles';
        const session = scenario(
          mode,
          [whimsicott, pawmot],
          doubles ? [audino, umbreon] : [audino],
        );
        const rival = doubles ? 'move 1 -2, move 1' : 'move 1';
        if (doubles) {
          // In doubles the fainted Whimsicott is still on the field when Pawmot revives.
          expect(session.choose('p1', 'move 1 1, move 1').ok).toBe(true);
          expect(session.choose('p2', rival).ok).toBe(true);
        } else {
          // In singles Whimsicott faints on turn 1 and Pawmot revives it from the bench.
          expect(session.choose('p1', 'move 1').ok).toBe(true);
          expect(session.choose('p2', rival).ok).toBe(true);
          expect(session.choose('p1', 'switch 2').ok).toBe(true);
          expect(session.choose('p1', 'move 1').ok).toBe(true);
          expect(session.choose('p2', rival).ok).toBe(true);
        }
        const request = session.getRequest('p1') as SwitchRequest;
        const reviver = getSlotOptions(request).find((slot) => slot.pokemon.reviving);
        expect(reviver?.switches).toEqual([doubles ? 1 : 2]);

        await decideFor(session, 'p1', create(), { maxRetries: 0 });
        const revived = session
          .getRequest('p1')
          ?.side.pokemon.find((pokemon) => pokemon.ident.endsWith('Whimsicott'));
        expect(revived?.condition).not.toMatch(/fnt/);
      },
    );
  });
});
