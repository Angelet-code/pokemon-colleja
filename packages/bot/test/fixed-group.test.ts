import type { Choice, PokemonSet } from '@colleja/core';
import { getStandardSets } from '@colleja/data';
import { BattleSession } from '@colleja/engine';
import { standardToSet } from '@colleja/teamgen';
import { describe, expect, it } from 'vitest';
import { createBot } from '../src/index';
import { LIGHT_SEARCH, teamWith } from './helpers';

function standard(species: string, item: string): PokemonSet {
  const [entry] = getStandardSets(species, 'doubles');
  if (!entry) throw new Error(`sin set estándar: ${species}`);
  return { ...standardToSet(entry), item };
}

const team = () => [
  standard('farigiraf', 'lifeorb'),
  standard('torkoal', 'charcoal'),
  standard('conkeldurr', 'blackbelt'),
  standard('kingambit', 'sitrusberry'),
  standard('whimsicott', 'focussash'),
  standard('basculegion', 'choicescarf'),
];

function previewContext() {
  const session = BattleSession.create({
    mode: 'doubles',
    seed: 'fixed-group',
    options: { teamPreview: true, openTeamSheets: false },
    players: {
      p1: { name: 'Bot', team: team() },
      p2: { name: 'Rival', team: teamWith('doubles', [], 'rival') },
    },
  });
  const context = session.getAgentContext('p1');
  if (!context) throw new Error('p1 no tiene que elegir');
  return context;
}

/** The team positions of a team-preview choice, in order. */
function order(choice: Choice): number[] {
  if (choice.type !== 'team') throw new Error('no es una elección de equipo');
  return choice.order;
}

describe('fixed group at team preview (arena --fixed-group, fase 21)', () => {
  for (const level of [2, 3] as const) {
    it(`level ${level} brings exactly the group and chooses who leads`, async () => {
      const group = [6, 2, 5, 1];
      const bot = createBot(level, {
        seed: 'g',
        fixedGroup: group,
        ...(level === 3 ? { settings: LIGHT_SEARCH } : {}),
      });
      const chosen = order(await bot.choose(previewContext()));
      expect([...chosen].sort()).toEqual([...group].sort());
      // Same seed and situation: same order.
      const again = createBot(level, {
        seed: 'g',
        fixedGroup: group,
        ...(level === 3 ? { settings: LIGHT_SEARCH } : {}),
      });
      expect(order(await again.choose(previewContext()))).toEqual(chosen);
    });
  }
});
