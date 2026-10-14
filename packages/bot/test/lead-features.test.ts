import type { PokemonSet, SideId } from '@colleja/core';
import { getSpecies, getStandardSets, toId } from '@colleja/data';
import { standardToSet } from '@colleja/teamgen';
import { describe, expect, it } from 'vitest';
import { makeCombatant } from '../src/analysis/combatant';
import { emptyField } from '../src/analysis/damage';
import {
  extractLeadFeatures,
  LEAD_FEATURES,
  type LeadFeatureId,
  TEAM_MATCHUP_FEATURES,
  withOwnBack,
} from '../src/index';
import type { Position } from '../src/learning/position';

function standard(species: string): PokemonSet {
  const [entry] = getStandardSets(species, 'doubles');
  if (!entry) throw new Error(`sin set estándar: ${species}`);
  return { ...standardToSet(entry), item: 'sitrusberry' };
}

const meowstic = (species: 'meowstic' | 'meowsticf'): PokemonSet => ({
  species,
  ability: 'competitive',
  nature: 'modest',
  statPoints: { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 },
  moves: ['psychic', 'shadowball', 'fakeout', 'protect'],
});

/** A lead position with both groups of four fully known (leads first). */
function leadPosition(p1: PokemonSet[], p2: PokemonSet[]): Position {
  const side = (sets: PokemonSet[], id: SideId) => ({
    members: sets.map((set, i) => ({
      combatant: makeCombatant({ side: id, set }),
      active: i < 2,
      fainted: false,
      fresh: true,
      weight: 1,
    })),
    megaUsed: false,
  });
  return {
    doubles: true,
    turn: 1,
    field: emptyField(true),
    timers: { trickRoom: 0, tailwind: { p1: 0, p2: 0 }, screens: { p1: 0, p2: 0 } },
    sides: { p1: side(p1, 'p1'), p2: side(p2, 'p2') },
  };
}

const record = (x: readonly number[]) =>
  Object.fromEntries(LEAD_FEATURES.map((feature, i) => [feature.id, x[i] ?? 0])) as Record<
    LeadFeatureId,
    number
  >;

const rivals = () => ['garchomp', 'sylveon', 'kingambit', 'pelipper'].map(standard);

describe('lead factors (fase 21)', () => {
  it('never name a species: two species alike give the same factors', () => {
    const back = [standard('pelipper'), standard('torkoal'), standard('sylveon')];
    const male = leadPosition([meowstic('meowstic'), ...back], rivals());
    const female = leadPosition([meowstic('meowsticf'), ...back], rivals());
    expect(extractLeadFeatures(female, 'p1')).toEqual(extractLeadFeatures(male, 'p1'));
    expect(extractLeadFeatures(female, 'p2')).toEqual(extractLeadFeatures(male, 'p2'));
    for (const feature of LEAD_FEATURES) expect(getSpecies(toId(feature.id))).toBeUndefined();
  });

  it('change with the stats: faster leads move first', () => {
    const base = leadPosition(
      ['torkoal', 'pelipper', 'incineroar', 'sylveon'].map(standard),
      rivals(),
    );
    const before = record(extractLeadFeatures(base, 'p1'));
    const fast = structuredClone(base);
    for (const member of fast.sides.p1.members) member.combatant.stats.spe = 400;
    const after = record(extractLeadFeatures(fast, 'p1'));
    expect(after.leadSpeed).toBeGreaterThan(before.leadSpeed);
    expect(after.teamSpeed).toBeGreaterThan(before.teamSpeed);
  });

  it('are seen from each side as mirrors when both sides know the same', () => {
    const p = leadPosition(
      ['incineroar', 'pelipper', 'torkoal', 'sylveon'].map(standard),
      rivals(),
    );
    const mine = record(extractLeadFeatures(p, 'p1'));
    const theirs = record(extractLeadFeatures(p, 'p2'));
    for (const feature of LEAD_FEATURES) {
      expect(mine[feature.id]).toBeCloseTo(-theirs[feature.id], 9);
    }
  });

  it('keep the team matchup apart: swapping who leads within a group leaves it unchanged', () => {
    const sets = ['incineroar', 'pelipper', 'torkoal', 'sylveon'].map(standard);
    const one = record(extractLeadFeatures(leadPosition(sets, rivals()), 'p1'));
    const other = record(
      extractLeadFeatures(leadPosition([...sets.slice(2), ...sets.slice(0, 2)], rivals()), 'p1'),
    );
    for (const id of TEAM_MATCHUP_FEATURES) expect(other[id]).toBeCloseTo(one[id], 9);
    expect(other.leadSpeed).not.toBe(one.leadSpeed);
  });

  it('see the own back as known (withOwnBack) and the rival as a spectator', () => {
    const p = leadPosition(
      ['incineroar', 'pelipper', 'torkoal', 'sylveon'].map(standard),
      rivals(),
    );
    const own = withOwnBack(p, 'p1', [{ set: standard('garchomp'), weight: 1 }]);
    expect(own.sides.p1.members.map((member) => member.combatant.set.species)).toEqual([
      'incineroar',
      'pelipper',
      'torkoal',
      'sylveon',
      'garchomp',
    ]);
    expect(own.sides.p2).toBe(p.sides.p2);
  });
});
