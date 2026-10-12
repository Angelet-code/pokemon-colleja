import type { PokemonSet, SideId } from '@colleja/core';
import { getSpecies, getStandardSets, toId } from '@colleja/data';
import { standardToSet } from '@colleja/teamgen';
import { describe, expect, it } from 'vitest';
import { type Combatant, makeCombatant } from '../src/analysis/combatant';
import { emptyField } from '../src/analysis/damage';
import { EffectTimers, extractFeatures, FEATURES, featureRecord } from '../src/index';
import type { Position, PositionMember } from '../src/learning/position';

function standard(species: string): PokemonSet {
  const [entry] = getStandardSets(species, 'doubles');
  if (!entry) throw new Error(`sin set estándar: ${species}`);
  return { ...standardToSet(entry), item: 'sitrusberry' };
}

/** The same set on another species. */
const meowstic = (species: 'meowstic' | 'meowsticf'): PokemonSet => ({
  species,
  ability: 'competitive',
  nature: 'modest',
  statPoints: { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 },
  moves: ['psychic', 'shadowball', 'fakeout', 'protect'],
});

const member = (combatant: Combatant, active: boolean): PositionMember => ({
  combatant,
  active,
  fainted: false,
  fresh: true,
  weight: 1,
});

function position(p1: PokemonSet[], p2: PokemonSet[]): Position {
  const side = (sets: PokemonSet[], id: SideId) => ({
    members: sets.map((set, i) => member(makeCombatant({ side: id, set }), i < 2)),
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

const rivals = () => [standard('garchomp'), standard('sylveon'), standard('kingambit')];

describe('factors of a position (fase 17)', () => {
  it('never name a species: two species alike give the same factors', () => {
    // Meowstic and Meowstic-F: same base stats and types, here with the same set.
    expect(getSpecies('meowstic')?.baseStats).toEqual(getSpecies('meowsticf')?.baseStats);
    const male = position([meowstic('meowstic'), standard('pelipper')], rivals());
    const female = position([meowstic('meowsticf'), standard('pelipper')], rivals());
    expect(extractFeatures(female, 'p1')).toEqual(extractFeatures(male, 'p1'));
    expect(extractFeatures(female, 'p2')).toEqual(extractFeatures(male, 'p2'));
    // No factor is about one species.
    for (const feature of FEATURES) expect(getSpecies(toId(feature.id))).toBeUndefined();
  });

  it('change with the stats: a faster species moves first', () => {
    const base = position([standard('torkoal'), standard('pelipper')], rivals());
    const before = featureRecord(extractFeatures(base, 'p1'));
    // The same Pokémon if an update raised its base Speed.
    const fast = structuredClone(base);
    for (const entry of fast.sides.p1.members) entry.combatant.stats.spe = 400;
    const after = featureRecord(extractFeatures(fast, 'p1'));
    expect(after.fieldSpeed).toBeGreaterThan(before.fieldSpeed);
    expect(after.teamSpeed).toBeGreaterThan(before.teamSpeed);
    // Under Trick Room the slow side moves first.
    const room = structuredClone(base);
    room.timers.trickRoom = 4;
    const trickRoom = featureRecord(extractFeatures(room, 'p1'));
    expect(trickRoom.fieldSpeed).toBeGreaterThan(before.fieldSpeed);
    expect(trickRoom.trickRoom).toBeGreaterThan(0);
  });

  it('are seen from each side as mirrors', () => {
    const p = position([standard('incineroar'), standard('pelipper')], rivals());
    const mine = featureRecord(extractFeatures(p, 'p1'));
    const theirs = featureRecord(extractFeatures(p, 'p2'));
    expect(mine.fieldSpeed).toBe(-theirs.fieldSpeed);
    expect(mine.answers).toBeCloseTo(-theirs.answers, 9);
    expect(mine.koFor).toBe(theirs.koAgainst);
    expect(mine.damageFor).toBe(theirs.damageAgainst);
    // Fake Out (by what the move does) on a fresh Pokémon.
    expect(mine.fakeOut).toBe(1);
  });

  it('count the turns left of Trick Room, Tailwind and screens', () => {
    const timers = new EffectTimers();
    timers.applyAll([
      '|turn|2',
      '|-fieldstart|move: Trick Room|[of] p2a: Farigiraf',
      '|-sidestart|p1: Ana|move: Tailwind',
      '|-sidestart|p2: Bea|Reflect',
      '|turn|3',
    ]);
    expect(timers.left()).toEqual({
      trickRoom: 4,
      tailwind: { p1: 3, p2: 0 },
      screens: { p1: 0, p2: 4 },
    });
    timers.applyAll(['|-sideend|p1: Ana|move: Tailwind', '|turn|6']);
    expect(timers.left()).toEqual({
      trickRoom: 1,
      tailwind: { p1: 0, p2: 0 },
      screens: { p1: 0, p2: 1 },
    });
    timers.applyAll(['|-fieldend|move: Trick Room', '|turn|7']);
    expect(timers.left().trickRoom).toBe(0);
  });
});
