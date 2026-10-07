import { getStandardSets } from '@colleja/data';
import { describe, expect, it } from 'vitest';
import { OpponentModel, type RevealedInfo } from '../src/index';

function revealed(species: string, info: Partial<RevealedInfo> = {}): RevealedInfo {
  return {
    baseSpecies: species,
    species,
    item: undefined,
    ability: undefined,
    moves: [],
    megaEvolved: false,
    ...info,
  };
}

describe('OpponentModel', () => {
  const model = new OpponentModel('singles');

  it('starts from every standard set, the most offensive first', () => {
    const candidates = model.candidates(revealed('metagross'));
    expect(candidates).toHaveLength(getStandardSets('metagross', 'singles').length);
    const offense = (set: (typeof candidates)[number]) =>
      Math.max(set.statPoints.atk, set.statPoints.spa);
    expect(offense(candidates[0] as (typeof candidates)[number])).toBe(32);
  });

  it('keeps only the sets that agree with what has been revealed', () => {
    const all = getStandardSets('metagross', 'singles');
    const withLifeOrb = model.candidates(revealed('metagross', { item: 'lifeorb' }));
    expect(withLifeOrb.length).toBe(all.filter((set) => set.item === 'lifeorb').length);
    expect(withLifeOrb.every((set) => set.item === 'lifeorb')).toBe(true);

    const withMove = model.candidates(revealed('metagross', { moves: ['bodypress'] }));
    expect(withMove.every((set) => set.moves.includes('bodypress'))).toBe(true);

    const mega = model.candidates(
      revealed('metagross', { species: 'metagrossmega', megaEvolved: true, item: 'metagrossite' }),
    );
    expect(mega.every((set) => set.item === 'metagrossite')).toBe(true);
  });

  it('puts revealed moves on top of the assumed set when no set agrees', () => {
    const [set] = model.candidates(revealed('metagross', { moves: ['splash'] }));
    expect(set?.moves[0]).toBe('splash');
    expect(set?.moves.length).toBeLessThanOrEqual(4);
  });

  it('uses the real set with Open Team Sheets', () => {
    const real = {
      species: 'garchomp',
      ability: 'roughskin',
      nature: 'adamant',
      statPoints: { hp: 32, atk: 32, def: 0, spa: 0, spd: 0, spe: 2 },
      moves: ['earthquake', 'dragonclaw'],
    };
    const open = new OpponentModel('singles', [real]);
    expect(open.candidates(revealed('garchomp'))).toEqual([real]);
  });

  it('builds a neutral set for species without standard sets', () => {
    const [set] = new OpponentModel('singles').candidates(revealed('missingno'));
    expect(set).toMatchObject({ species: 'missingno', nature: 'serious', moves: [] });
  });
});
