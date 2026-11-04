import { describe, expect, it } from 'vitest';
import { indexForSearch, normalizeSearch, searchIndex } from '../src/lib/search';

const NAMES = [
  'Proliferación Population Bomb Normal',
  'Lanzallamas Flamethrower Fuego',
  'Llamarada Fire Blast Fuego',
  'Protección Protect Normal',
  'Puño Fuego Fire Punch Fuego',
];
const index = indexForSearch(NAMES, (name) => name);
const search = (query: string) => searchIndex(index, query).map((name) => name.split(' ')[0]);

describe('normalizeSearch', () => {
  it('drops accents, case and punctuation', () => {
    expect(normalizeSearch('Proliferación, ¡YA!')).toBe('proliferacion ya');
  });
});

describe('searchIndex', () => {
  it('returns everything for an empty query', () => {
    expect(searchIndex(index, '  ')).toHaveLength(NAMES.length);
  });

  it('matches exact words anywhere, in either language, without accents', () => {
    expect(search('proliferacion')).toEqual(['Proliferación']);
    expect(search('flameth')).toEqual(['Lanzallamas']);
    expect(search('fuego pu')).toEqual(['Puño']);
    expect(search('prolif')).toEqual(['Proliferación']);
  });

  it('forgives typos when nothing matches exactly', () => {
    expect(search('ploriferacion')).toEqual(['Proliferación']);
    expect(search('lanzallmas')).toEqual(['Lanzallamas']);
    expect(search('lnazallamas')).toEqual(['Lanzallamas']);
    expect(search('portect')).toEqual(['Protección']);
  });

  it('prefers exact matches over typo ones', () => {
    // "llama" is inside two names: no typo matches are added.
    expect(search('llama')).toEqual(['Lanzallamas', 'Llamarada']);
  });

  it('sorts typo matches by how close they are', () => {
    expect(search('protecion')[0]).toBe('Protección');
  });

  it('does not forgive typos in short words', () => {
    expect(search('pzx')).toEqual([]);
    expect(search('xyzzy')).toEqual([]);
  });
});
