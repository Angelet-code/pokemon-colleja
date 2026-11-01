import { type PokemonSet, SeededRandom } from '@colleja/core';
import { toId } from '@colleja/data';
import { BattleSession } from '@colleja/engine';
import { describe, expect, it } from 'vitest';
import { Situation } from '../src/analysis/situation';
import { rivalAssumptions } from '../src/search/assumptions';
import { teamWith } from './helpers';

/** Turn 1 of a doubles battle with closed team sheets: each side brought its first four. */
function turnOne() {
  const rival = teamWith('doubles', [], 'sets:rival');
  const session = BattleSession.create({
    mode: 'doubles',
    seed: 'sets',
    options: { teamPreview: true, openTeamSheets: false },
    players: {
      p1: { name: 'Bot', team: teamWith('doubles', [], 'sets:bot') },
      p2: { name: 'Rival', team: rival },
    },
  });
  session.choose('p1', 'team 1234');
  session.choose('p2', 'team 1234');
  const context = session.getAgentContext('p1');
  if (!context) throw new Error('p1 no tiene que elegir');
  return { context, rival };
}

/** Whether every assumed set of a brought rival is its real one (moves, item and spread). */
function allReal(situation: Situation, rival: readonly PokemonSet[]): boolean {
  const real = new Map(rival.map((set) => [toId(set.species), set]));
  return rivalAssumptions(situation, 8, new SeededRandom('s')).every((assumption) =>
    assumption.team.every((set) => {
      const truth = real.get(toId(set.species));
      return (
        truth !== undefined &&
        set.item === truth.item &&
        [...set.moves].sort().join() === [...truth.moves].sort().join() &&
        set.nature === truth.nature &&
        JSON.stringify(set.statPoints) === JSON.stringify(truth.statPoints)
      );
    }),
  );
}

describe("the rival's real sets (measuring hook, fase 25)", () => {
  it('without it, the bot guesses', () => {
    const { context, rival } = turnOne();
    expect(context.opponentTeam).toBeNull();
    expect(allReal(new Situation(context, { beliefs: 'infer' }), rival)).toBe(false);
  });

  it('with it, every assumption is the real team', () => {
    const { context, rival } = turnOne();
    const situation = new Situation(context, { beliefs: 'infer', rivalSets: rival });
    expect(allReal(situation, rival)).toBe(true);
    // The rival in the forks still does not see the bot's sets.
    expect(situation.context.opponentTeam).toBeNull();
  });
});
