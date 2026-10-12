import { BattleView, type Choice, requestKind } from '@colleja/core';
import { BattleSession } from '@colleja/engine';
import { generateTeam } from '@colleja/teamgen';
import { describe, expect, it } from 'vitest';
import {
  createBot,
  EffectTimers,
  extractFeatures,
  featureRecord,
  ownPosition,
  Situation,
  spectatorPosition,
} from '../src/index';

/** A doubles battle played by level 2 until turn `turn`, at p1's move request. */
function battleAt(turn: number, seed: string): BattleSession {
  const session = BattleSession.create({
    mode: 'doubles',
    seed,
    options: { teamPreview: true, openTeamSheets: false },
    players: {
      p1: { name: 'Bot', team: generateTeam('doubles', { seed: `${seed}:1` }) },
      p2: { name: 'Rival', team: generateTeam('doubles', { seed: `${seed}:2` }) },
    },
  });
  const bots = {
    p1: createBot(2, { seed: `${seed}:p1` }),
    p2: createBot(2, { seed: `${seed}:p2` }),
  };
  for (let guard = 0; guard < 200 && !session.ended; guard++) {
    const p1 = session.getAgentContext('p1');
    if (session.turn >= turn && p1 && requestKind(p1.request) === 'move') break;
    for (const side of session.pendingSides()) {
      const context = session.getAgentContext(side);
      if (context) session.choose(side, bots[side].choose(context) as Choice);
    }
  }
  return session;
}

/**
 * Factors that depend neither on any set nor on which Pokémon it brought (a spectator does not
 * know its unseen ones): they must match between both positions.
 */
const SET_FREE = ['fieldHp', 'tailwind', 'screens', 'boosts', 'status'] as const;

describe('own position (fase 19)', () => {
  it.each(['a', 'b', 'c'])('matches the spectator one except for its own team (%s)', (seed) => {
    const session = battleAt(4, `own-position:${seed}`);
    const context = session.getAgentContext('p1');
    if (!context || requestKind(context.request) !== 'move') throw new Error('sin turno de p1');
    const situation = new Situation(context);
    const timers = new EffectTimers().applyAll(context.log).left();
    const own = ownPosition(situation, timers);
    const view = BattleView.from(context.log);
    const spectator = spectatorPosition(view, timers, 'doubles');

    expect(own.turn).toBe(spectator.turn);
    for (const side of ['p1', 'p2'] as const) {
      const mine = featureRecord(extractFeatures(own, side));
      const seen = featureRecord(extractFeatures(spectator, side));
      for (const feature of SET_FREE) expect(mine[feature]).toBeCloseTo(seen[feature], 6);
    }
    // The rival's side is built like a spectator's: same members and sets without beliefs.
    const rival = (position: typeof own) =>
      position.sides.p2.members.map((m) => [m.combatant.set, m.active, m.fainted, m.weight]);
    expect(rival(own)).toEqual(rival(spectator));
    // Its own side: the Pokémon it brought, with their exact sets and the HP the view shows.
    expect(own.sides.p1.members.map((m) => m.combatant.set)).toEqual(
      situation.own.map((member) => member.set),
    );
    expect(own.sides.p1.members.every((m) => m.weight === 1)).toBe(true);
    for (const pokemon of view.sides.p1.pokemon) {
      const member = own.sides.p1.members.find((m) => m.combatant.species === pokemon.species);
      expect(member?.active).toBe(pokemon.position !== null && !pokemon.fainted);
      expect(member?.combatant.hp).toBe(pokemon.hp);
    }
  });

  it('uses the assumed sets of a search fork for the rival', () => {
    const session = battleAt(2, 'own-position:assumed');
    const context = session.getAgentContext('p1');
    if (!context) throw new Error('sin turno de p1');
    const situation = new Situation(context);
    const timers = new EffectTimers().applyAll(context.log).left();
    const [rival] = situation.view.sides.p2.pokemon;
    if (!rival) throw new Error('sin rival visto');
    const assumed = { ...situation.own[0]?.set, species: rival.baseSpecies, moves: ['protect'] };
    const position = ownPosition(situation, timers, {
      [rival.name]: assumed as (typeof situation.own)[number]['set'],
    });
    expect(position.sides.p2.members[0]?.combatant.moves).toEqual(['protect']);
  });
});
