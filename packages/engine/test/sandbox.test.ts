import {
  type ActionableRequest,
  actionsChoice,
  championsStats,
  type MoveRequest,
  moveAction,
  type PokemonSet,
  parseCondition,
  type RivalAssumption,
  teamChoice,
} from '@colleja/core';
import { describe, expect, it } from 'vitest';
import type { BattleSession } from '../src/index';
import { createFixtureSession } from './helpers';

/** A Dragonite unlike the real one (fixture B: Dragon Dance, Extreme Speed, Earthquake, Roost). */
const dragonite: PokemonSet = {
  species: 'dragonite',
  nickname: 'Dragonite',
  item: 'leftovers',
  ability: 'multiscale',
  nature: 'careful',
  statPoints: { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 },
  moves: ['outrage', 'firepunch', 'thunderwave', 'roost'],
};
const unseen: PokemonSet[] = [
  {
    species: 'volcarona',
    ability: 'flamebody',
    nature: 'timid',
    statPoints: { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 },
    moves: ['quiverdance', 'fierydance', 'bugbuzz', 'gigadrain'],
  },
  {
    species: 'tyranitar',
    ability: 'sandstream',
    nature: 'adamant',
    statPoints: { hp: 32, atk: 32, def: 0, spa: 0, spd: 0, spe: 2 },
    moves: ['rockslide', 'crunch', 'earthquake', 'protect'],
  },
];
const assumption: RivalAssumption = { seen: { Dragonite: dragonite }, unseen };

/** Singles without preview: p1 leads with Incineroar, p2 with Dragonite (Gengar, Corviknight behind). */
function singles(seed = 'sandbox') {
  return createFixtureSession('singles', seed, { options: { teamPreview: false } });
}

function sandboxOf(session: BattleSession) {
  const sandbox = session.getAgentContext('p1')?.sandbox;
  if (!sandbox) throw new Error('p1 no tiene sandbox');
  return sandbox;
}

function moveIds(request: ActionableRequest | null): string[] {
  return (request as MoveRequest).active[0]?.moves.map((move) => move.id) ?? [];
}

describe('battle sandbox', () => {
  it('is offered only while choosing moves', () => {
    const session = createFixtureSession('singles', 'preview');
    expect(session.getAgentContext('p1')?.sandbox).toBeUndefined();
    session.choose('p1', teamChoice([1, 2, 3]));
    session.choose('p2', teamChoice([1, 2, 3]));
    expect(session.getAgentContext('p1')?.sandbox).toBeDefined();
  });

  it('replaces the rival sets with the assumption, seen and unseen', () => {
    const session = singles();
    const fork = sandboxOf(session).fork(assumption, 'a');
    const request = fork.request('p2') as MoveRequest;
    expect(moveIds(request)).toEqual(['outrage', 'firepunch', 'thunderwave', 'roost']);
    const [lead, ...bench] = request.side.pokemon;
    const { hp, ...stats } = championsStats(dragonite);
    expect(lead?.stats).toEqual(stats);
    expect(lead?.item).toBe('leftovers');
    expect(lead?.condition).toBe(`${hp}/${hp}`);
    // The real bench (Gengar, Corviknight) has not been seen: it becomes the assumed one.
    expect(bench.map((pokemon) => pokemon.details.split(',')[0])).toEqual([
      'Volcarona',
      'Tyranitar',
    ]);
    expect(fork.pokemon('p2').map((pokemon) => pokemon.species)).toEqual([
      'dragonite',
      'volcarona',
      'tyranitar',
    ]);
    // Own side stays as it is.
    expect(fork.request('p1')).toEqual(session.getRequest('p1'));
  });

  it('gives the rival the HP percentage the player sees', () => {
    const session = singles('damage');
    session.choose('p1', actionsChoice(moveAction(3))); // Darkest Lariat
    session.choose('p2', actionsChoice(moveAction(1))); // Dragon Dance: no healing
    const seen = session.getLog('p1').findLast((line) => line.startsWith('|-damage|p2a'));
    const shown = parseCondition(seen?.split('|')[3] ?? '');
    expect(shown.maxhp).toBe(100);
    const fork = sandboxOf(session).fork(assumption, 'a');
    const [lead] = fork.pokemon('p2');
    expect(lead?.hp).toBe(Math.round((shown.hp / 100) * (lead?.maxhp ?? 0)));
  });

  it('is reproducible, independent of the real battle and forgets the rival choice', () => {
    const session = singles();
    session.choose('p2', actionsChoice(moveAction(1)));
    const before = [...session.inputLog];
    const play = (seed: string) => {
      const fork = sandboxOf(session).fork(assumption, seed);
      expect(fork.request('p2')).not.toBeNull();
      expect(fork.choose('p1', actionsChoice(moveAction(2)))).toBe(true);
      expect(fork.choose('p2', actionsChoice(moveAction(2)))).toBe(true);
      expect(fork.turn).toBe(2);
      return fork.log('p1');
    };
    const first = play('x');
    expect(play('x')).toEqual(first);
    expect(first.some((line) => line.includes('|Fire Punch|'))).toBe(true);
    expect(session.inputLog).toEqual(before);
    expect(session.turn).toBe(1);
  });

  it('clones a position with a new seed and an empty log', () => {
    const fork = sandboxOf(singles()).fork(assumption, 'a');
    fork.choose('p1', actionsChoice(moveAction(2)));
    fork.choose('p2', actionsChoice(moveAction(1)));
    const copy = fork.clone('b');
    expect(copy.turn).toBe(fork.turn);
    expect(copy.log('p1')).toEqual([]);
    expect(copy.pokemon('p1')).toEqual(fork.pokemon('p1'));
  });

  it('refuses stale positions and missing assumptions', () => {
    const session = singles();
    const sandbox = sandboxOf(session);
    expect(() => sandbox.fork({ seen: {}, unseen }, 'a')).toThrow(/Dragonite/);
    expect(() => sandbox.fork({ seen: assumption.seen, unseen: [] }, 'a')).toThrow();
    session.choose('p1', actionsChoice(moveAction(2)));
    session.choose('p2', actionsChoice(moveAction(1)));
    expect(() => sandbox.fork(assumption, 'a')).toThrow(/ha cambiado/);
  });
});
