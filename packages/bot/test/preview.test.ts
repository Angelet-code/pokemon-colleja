import { championsStats, emptyStatTable, formatChoice, type PokemonSet } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import { BattleSession } from '@colleja/engine';
import { describe, expect, it } from 'vitest';
import { makeCombatant } from '../src/analysis/combatant';
import { compareSpeed, roleOf } from '../src/analysis/preview-read';
import { ExpertAgent } from '../src/index';
import { set, teamWith } from './helpers';

const garchomp = set('garchomp', ['earthquake', 'dragonclaw', 'rockslide', 'protect'], {
  item: 'lifeorb',
  nature: 'jolly',
  spread: { hp: 2, atk: 32, spa: 0, spe: 32 },
});

/** A battle at team preview: the bot plays p1. */
function preview(
  mode: GameMode,
  p1: PokemonSet[],
  p2: PokemonSet[],
  openTeamSheets = false,
): BattleSession {
  return BattleSession.create({
    mode,
    seed: 'preview',
    options: { teamPreview: true, openTeamSheets },
    players: { p1: { name: 'Bot', team: p1 }, p2: { name: 'Rival', team: p2 } },
  });
}

function decide(session: BattleSession, seed = 's') {
  const bot = new ExpertAgent({ seed });
  const context = session.getAgentContext('p1');
  if (!context) throw new Error('p1 no tiene que elegir');
  const choice = bot.choose(context);
  return { choice: formatChoice(choice), explanation: bot.explain() };
}

describe('level 3 team preview', () => {
  for (const [mode, picked, leads] of [
    ['singles', 3, 1],
    ['doubles', 4, 2],
  ] as const) {
    it(`brings a group and explains what it read of both teams (${mode})`, () => {
      const session = preview(mode, teamWith(mode, [], 'own'), teamWith(mode, [], 'rival'));
      const { choice, explanation } = decide(session);
      expect(choice).toMatch(new RegExp(`^team \\d(, \\d){${picked - 1}}$`));
      expect(explanation?.kind).toBe('team');
      const chosen = explanation?.options.filter((option) => option.chosen) ?? [];
      expect(chosen).toHaveLength(1);
      const actions = chosen[0]?.actions ?? [];
      expect(actions).toHaveLength(picked);
      expect(actions.filter((action) => action.kind === 'bring' && action.lead)).toHaveLength(
        leads,
      );

      const read = explanation?.preview;
      expect(read?.rivals).toHaveLength(6);
      expect(read?.own).toHaveLength(6);
      expect(read?.matchups).toHaveLength(36);
      // Chances add up to the Pokémon brought and the leads.
      const brought = read?.rivals.reduce((sum, rival) => sum + rival.brought, 0) ?? 0;
      const led = read?.rivals.reduce((sum, rival) => sum + rival.lead, 0) ?? 0;
      expect(brought).toBeCloseTo(picked, 1);
      expect(led).toBeCloseTo(leads, 1);
      // Most dangerous first.
      const threats = read?.rivals.map((rival) => rival.threat) ?? [];
      expect(threats).toEqual([...threats].sort((a, b) => b - a));
      // What it believes of each of the player's six.
      expect(explanation?.beliefs).toHaveLength(6);
    });
  }

  it('reads roles, speeds and hits with open team sheets', () => {
    const rival = teamWith('singles', [garchomp], 'rival');
    const { explanation } = decide(preview('singles', teamWith('singles', [], 'own'), rival, true));
    const read = explanation?.preview;
    const entry = read?.rivals.find((r) => r.species === 'garchomp');
    const speed = championsStats(garchomp).spe;
    expect(entry?.role).toBe('physical');
    expect(entry?.speed).toEqual([speed, speed]);
    for (const matchup of read?.matchups.filter((m) => m.rival === 'garchomp') ?? []) {
      const own = read?.own.find((pokemon) => pokemon.species === matchup.own)?.speed ?? 0;
      const expected = own > speed ? 'faster' : own < speed ? 'slower' : 'tie';
      expect(matchup.speed).toBe(expected);
      const taken = matchup.taken;
      if (taken) {
        expect(taken.min).toBeLessThanOrEqual(taken.max);
        expect(taken.hits).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('never peeks at the sets of the player with closed team sheets', () => {
    const own = teamWith('singles', [], 'own');
    const rival = teamWith('singles', [], 'rival');
    const other = rival.map((member) => ({
      ...member,
      nature: 'serious',
      statPoints: { ...emptyStatTable(), hp: 32, def: 32, spd: 2 },
    }));
    expect(decide(preview('singles', own, other))).toEqual(decide(preview('singles', own, rival)));
  });

  it('is reproducible and builds its explanation without changing the decision', () => {
    const session = preview('doubles', teamWith('doubles', [], 'a'), teamWith('doubles', [], 'b'));
    const context = session.getAgentContext('p1');
    if (!context) throw new Error('p1 no tiene que elegir');
    const explained = new ExpertAgent({ seed: 'x' });
    const silent = new ExpertAgent({ seed: 'x' });
    expect(explained.choose(context)).toEqual(silent.choose(context));
    explained.explain();
    expect(explained.choose(context)).toEqual(silent.choose(context));
  });
});

describe('preview read', () => {
  it('tells physical, special, mixed and support Pokémon apart', () => {
    const of = (moves: string[], spread = {}) =>
      roleOf(makeCombatant({ side: 'p1', set: set('garchomp', moves, { spread }) }));
    expect(of(['earthquake', 'dragonclaw', 'protect'])).toBe('physical');
    expect(of(['flamethrower', 'dracometeor'])).toBe('special');
    expect(of(['earthquake', 'flamethrower'], { atk: 32, spa: 32, hp: 2 })).toBe('mixed');
    expect(of(['earthquake', 'stealthrock', 'protect'])).toBe('support');
  });

  it('compares speeds over the guessed sets', () => {
    const guesses = [
      { speed: 100, weight: 0.5 },
      { speed: 150, weight: 0.5 },
    ];
    expect(compareSpeed(151, guesses)).toBe('faster');
    expect(compareSpeed(99, guesses)).toBe('slower');
    expect(compareSpeed(120, guesses)).toBe('depends');
    expect(compareSpeed(100, [{ speed: 100, weight: 1 }])).toBe('tie');
  });
});
