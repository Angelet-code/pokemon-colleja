import type { PokemonSet } from '@colleja/core';
import { getSpecies, listSpecies } from '@colleja/data';
import { describe, expect, it } from 'vitest';
import {
  CALC_MOVES,
  type CalcSide,
  calcRequest,
  canMegaEvolve,
  defaultHits,
  emptyCalcField,
  fromSet,
  hitsOf,
  useCalc,
  withCalcMoves,
  withHits,
  withMega,
  withSet,
} from '../src/features/calc/calc-store';
import { speciesWithMegaOptions } from '../src/features/teams/options';
import { megaOf, withMegaSpecies } from '../src/features/teams/team-draft';
import { indexForSearch, searchIndex } from '../src/lib/search';

const TYRANITAR: PokemonSet = {
  species: 'tyranitar',
  item: 'leftovers',
  ability: 'sandstream',
  nature: 'adamant',
  statPoints: { hp: 32, atk: 32, def: 0, spa: 0, spd: 2, spe: 0 },
  moves: ['rockslide', 'crunch', 'earthquake', 'protect'],
};

const side = (set: PokemonSet, mega: boolean): CalcSide => ({ ...fromSet(set), mega });

describe('calculator Mega switch', () => {
  it('equips the Mega Stone when the switch is turned on', () => {
    const on = withMega(side(TYRANITAR, false), true);
    expect(on.mega).toBe(true);
    expect(on.set.item).toBe('tyranitarite');
  });

  it('keeps the stone when the switch is turned off, and the request is not Mega', () => {
    const off = withMega(side({ ...TYRANITAR, item: 'tyranitarite' }, true), false);
    expect(off).toMatchObject({ mega: false, set: { item: 'tyranitarite' } });
    const request = calcRequest(off, off, emptyCalcField(), 'crunch');
    expect(request.attacker.mega).toBeUndefined();
  });

  it('keeps the chosen stone of a species with two', () => {
    const charizard: PokemonSet = { ...TYRANITAR, species: 'charizard', item: 'charizarditey' };
    expect(withMega(side(charizard, false), true).set.item).toBe('charizarditey');
  });

  it('does nothing for a species without a Mega Evolution', () => {
    const incineroar: PokemonSet = { ...TYRANITAR, species: 'incineroar', ability: 'intimidate' };
    expect(canMegaEvolve(incineroar)).toBe(false);
    const before = side(incineroar, false);
    expect(withMega(before, true)).toBe(before);
  });

  it('follows the item: a new stone turns it on, losing it turns it off', () => {
    const equipped = withSet(side(TYRANITAR, false), { ...TYRANITAR, item: 'tyranitarite' });
    expect(equipped.mega).toBe(true);
    expect(withSet(equipped, TYRANITAR).mega).toBe(false);
  });

  it('keeps the switch off on other changes of a set that holds its stone', () => {
    const holding = side({ ...TYRANITAR, item: 'tyranitarite' }, false);
    expect(withSet(holding, { ...holding.set, nature: 'jolly' }).mega).toBe(false);
  });
});

describe('calculator Megas in the species picker', () => {
  it('picks the species with the stone of the chosen Mega', () => {
    const charizard: PokemonSet = { ...TYRANITAR, species: 'charizard', ability: 'blaze' };
    const set = withMegaSpecies(charizard, 'charizardmegay');
    expect(set).toMatchObject({ species: 'charizard', item: 'charizarditey' });
    expect(megaOf(set)).toBe('charizardmegay');
    expect(withMegaSpecies(TYRANITAR, 'charizardmegax')).toMatchObject({
      species: 'charizard',
      item: 'charizarditex',
      ability: 'blaze',
    });
    expect(withMegaSpecies(TYRANITAR, 'garchomp')).toBe(TYRANITAR);
  });

  it('lists every Mega right after its species, found by the species name', () => {
    const options = speciesWithMegaOptions('es');
    const at = options.findIndex((option) => option.value === 'charizard');
    expect(options.slice(at, at + 3).map((option) => option.value)).toEqual([
      'charizard',
      'charizardmegax',
      'charizardmegay',
    ]);
    const megas = options.filter((option) => getSpecies(option.value)?.kind === 'mega');
    expect(megas).toHaveLength(listSpecies('mega').length);
    const index = indexForSearch(options, (option) => `${option.label} ${option.search ?? ''}`);
    expect(searchIndex(index, 'charizard').map((option) => option.value)).toEqual([
      'charizard',
      'charizardmegax',
      'charizardmegay',
    ]);
  });
});

describe('calculator hits of multi-hit moves', () => {
  const maushold: PokemonSet = {
    ...TYRANITAR,
    species: 'maushold',
    item: 'widelens',
    ability: 'technician',
    moves: ['populationbomb', 'bulletseed', 'doublehit', 'protect'],
  };

  it('defaults to the calc: all if each hit can miss, 3 of 2–5 or 5 with Skill Link', () => {
    const attacker = fromSet(maushold);
    expect(defaultHits(attacker, 'populationbomb')).toBe(10);
    expect(defaultHits(attacker, 'bulletseed')).toBe(3);
    expect(defaultHits(fromSet({ ...maushold, ability: 'skilllink' }), 'bulletseed')).toBe(5);
    expect(defaultHits(attacker, 'doublehit')).toBeNull();
  });

  it('sends the chosen hits of that move only', () => {
    const attacker = withHits(fromSet(maushold), 'populationbomb', 4);
    expect(hitsOf(attacker, 'populationbomb')).toBe(4);
    expect(hitsOf(attacker, 'bulletseed')).toBe(3);
    const defender = fromSet(TYRANITAR);
    const field = emptyCalcField();
    expect(calcRequest(attacker, defender, field, 'populationbomb').hits).toBe(4);
    expect(calcRequest(attacker, defender, field, 'bulletseed').hits).toBeUndefined();
  });
});

describe('calculator move slots', () => {
  it('keeps two moves, the attacking ones first', () => {
    expect(CALC_MOVES).toBe(2);
    const set = { ...TYRANITAR, moves: ['protect', 'rockslide', 'crunch', 'earthquake'] };
    expect(withCalcMoves(set).moves).toEqual(['rockslide', 'crunch']);
    expect(withCalcMoves({ ...TYRANITAR, moves: ['protect', 'rockslide'] }).moves).toEqual([
      'protect',
      'rockslide',
    ]);
    expect(fromSet(set).set.moves).toHaveLength(2);
  });

  it('fits every side that reaches the store', () => {
    const four = { ...fromSet(TYRANITAR), set: TYRANITAR };
    useCalc.getState().load({ attacker: four, defender: four, field: emptyCalcField() });
    expect(useCalc.getState().attacker.set.moves).toEqual(['rockslide', 'crunch']);
    useCalc.getState().updateSide('defender', { set: TYRANITAR });
    expect(useCalc.getState().defender.set.moves).toHaveLength(2);
  });
});
