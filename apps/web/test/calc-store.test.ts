import type { PokemonSet } from '@colleja/core';
import { describe, expect, it } from 'vitest';
import {
  type CalcSide,
  calcRequest,
  canMegaEvolve,
  emptyCalcField,
  fromSet,
  withMega,
  withSet,
} from '../src/features/calc/calc-store';

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
