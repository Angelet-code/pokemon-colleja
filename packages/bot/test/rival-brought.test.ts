import { SeededRandom } from '@colleja/core';
import { toId } from '@colleja/data';
import { BattleSession } from '@colleja/engine';
import { describe, expect, it } from 'vitest';
import { Situation } from '../src/analysis/situation';
import { rivalAssumptions } from '../src/search/assumptions';
import { teamWith } from './helpers';

/** Turn 1 of a doubles battle with team preview: each side brought its first four. */
function turnOne() {
  const rival = teamWith('doubles', [], 'brought:rival');
  const session = BattleSession.create({
    mode: 'doubles',
    seed: 'brought',
    options: { teamPreview: true, openTeamSheets: false },
    players: {
      p1: { name: 'Bot', team: teamWith('doubles', [], 'brought:bot') },
      p2: { name: 'Rival', team: rival },
    },
  });
  session.choose('p1', 'team 1234');
  session.choose('p2', 'team 1234');
  const context = session.getAgentContext('p1');
  if (!context) throw new Error('p1 no tiene que elegir');
  return { context, rival: rival.map((set) => toId(set.species)) };
}

/** Species of the rivals not seen yet in each assumption (before the padding). */
function unseen(situation: Situation): Set<string> {
  const seen = situation.view.sides.p2.pokemon.length;
  const species = new Set<string>();
  for (const assumption of rivalAssumptions(situation, 8, new SeededRandom('u'))) {
    for (const set of assumption.unseen.slice(0, 4 - seen)) species.add(toId(set.species));
  }
  return species;
}

describe('what the rival brought (measuring hook, fase 23)', () => {
  it('without it, any preview species may be in the back', () => {
    const { context, rival } = turnOne();
    const species = unseen(new Situation(context));
    expect([...species].some((id) => rival.slice(4).includes(id))).toBe(true);
  });

  it('with it, only the brought ones are assumed', () => {
    const { context, rival } = turnOne();
    const situation = new Situation(context, { rivalBrought: rival.slice(0, 4) });
    expect(situation.view.sides.p2.preview).toHaveLength(4);
    const species = unseen(situation);
    expect(species.size).toBeGreaterThan(0);
    for (const id of species) expect(rival.slice(0, 4)).toContain(id);
    // The foes valued are only the brought ones too.
    expect(situation.foes).toHaveLength(4);
  });
});
