import { getStandardSets } from '@colleja/data';
import { describe, expect, it } from 'vitest';
import { OpponentModel, type RevealedInfo, type SetPriors } from '../src/index';

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

describe('OpponentModel with the sets that are played (fase 22)', () => {
  const garchomp = (item: string, atk: number) => ({
    species: 'garchomp',
    item,
    ability: 'roughskin',
    nature: 'jolly',
    statPoints: { hp: 32, atk, def: 0, spa: 0, spd: 34 - atk, spe: 32 },
    moves: ['earthquake', 'dragonclaw', 'protect', 'rockslide'],
  });
  const priors: SetPriors = {
    garchomp: [
      // Most likely first, even if less offensive than the next one.
      { set: garchomp('sitrusberry', 2), weight: 0.6 },
      { set: garchomp('lifeorb', 32), weight: 0.3 },
      { set: { ...garchomp('garchompite', 32), ability: 'sandveil' }, weight: 0.1 },
    ],
  };
  // Only the sets that are played (no share left to the standard ones).
  const model = new OpponentModel('doubles', null, priors, 0);

  it('assumes them most likely first, with their weights', () => {
    const candidates = model.weightedCandidates(revealed('garchomp'));
    expect(candidates.map((c) => c.set.item)).toEqual(['sitrusberry', 'lifeorb', 'garchompite']);
    [0.6, 0.3, 0.1].forEach((weight, i) => {
      expect(candidates[i]?.weight).toBeCloseTo(weight, 9);
    });
    expect(model.likelySetForSpecies('garchomp').item).toBe('sitrusberry');
  });

  it('keeps only those that agree with what has been revealed', () => {
    expect(model.candidates(revealed('garchomp', { item: 'lifeorb' }))).toEqual([
      garchomp('lifeorb', 32),
    ]);
    const mega = model.candidates(
      revealed('garchomp', { species: 'garchompmega', megaEvolved: true }),
    );
    expect(mega.map((set) => set.item)).toEqual(['garchompite']);
    // A move outside the sets is dropped first, as with the standard ones: the item still counts.
    const [set] = model.candidates(
      revealed('garchomp', { item: 'lifeorb', moves: ['swordsdance'] }),
    );
    expect(set?.item).toBe('lifeorb');
    expect(set?.moves[0]).toBe('swordsdance');
  });

  it('leaves a share of the prior to the standard sets that agree, after them', () => {
    const mixed = new OpponentModel('doubles', null, priors, 0.2);
    const candidates = mixed.weightedCandidates(revealed('garchomp'));
    const standard = new OpponentModel('doubles').candidates(revealed('garchomp'));
    expect(candidates.slice(0, 3).map((c) => c.set.item)).toEqual([
      'sitrusberry',
      'lifeorb',
      'garchompite',
    ]);
    expect(candidates.slice(3).map((c) => c.set)).toEqual(standard);
    expect(candidates.reduce((sum, c) => sum + c.weight, 0)).toBeCloseTo(1, 9);
    expect(candidates[0]?.weight).toBeCloseTo(0.6 * 0.8, 9);
    // Filtered by what has been revealed, the priors that are left keep their share.
    const lifeOrb = mixed.weightedCandidates(revealed('garchomp', { item: 'lifeorb' }));
    expect(lifeOrb[0]?.weight).toBeCloseTo(0.8, 9);
    expect(lifeOrb.slice(1).every((c) => c.set.item === 'lifeorb')).toBe(true);
  });

  it('falls back to the standard sets when none agrees, and for species without priors', () => {
    const standard = new OpponentModel('doubles');
    // No set that is played holds the other Mega Stone; a standard one does.
    const other = revealed('garchomp', { item: 'garchompitez' });
    expect(model.candidates(other)).toEqual(standard.candidates(other));
    expect(model.candidates(other)[0]?.item).toBe('garchompitez');
    expect(model.weightedCandidates(other).every((c) => c.weight === 1)).toBe(true);
    expect(model.candidates(revealed('metagross'))).toEqual(
      standard.candidates(revealed('metagross')),
    );
  });

  it('changes nothing without priors', () => {
    const plain = new OpponentModel('singles');
    const weighted = plain.weightedCandidates(revealed('metagross'));
    expect(weighted.map((c) => c.set)).toEqual(plain.candidates(revealed('metagross')));
    expect(weighted.every((c) => c.weight === 1)).toBe(true);
  });
});
