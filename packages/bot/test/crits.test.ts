import type { PokemonSet } from '@colleja/core';
import { describe, expect, it } from 'vitest';
import { makeCombatant } from '../src/analysis/combatant';
import { critChance, emptyField, estimateDamage } from '../src/analysis/damage';
import { DoublesSim, type SlotPlan } from '../src/analysis/doubles-sim';
import { withCritBoost } from '../src/analysis/duel';
import { Situation } from '../src/analysis/situation';
import { scenario, set } from './helpers';

const sirfetchd = set('sirfetchd', ['meteorassault', 'closecombat', 'nightslash', 'protect'], {
  ability: 'scrappy',
  item: 'leek',
  nature: 'adamant',
  spread: { hp: 32, atk: 32, spa: 0 },
});
const archaludon = set('archaludon', ['dragoncheer', 'flashcannon', 'dracometeor', 'protect'], {
  ability: 'stamina',
  item: 'leftovers',
});
const garchomp = set('garchomp', ['earthquake', 'rockslide', 'dragonclaw', 'protect'], {
  item: 'yacheberry',
});
const torkoal = set('torkoal', ['eruption', 'heatwave', 'earthpower', 'protect'], {
  ability: 'shellarmor',
  item: 'charcoal',
});

function combatant(pokemonSet: PokemonSet, side: 'p1' | 'p2' = 'p1') {
  return makeCombatant({ side, set: pokemonSet });
}

describe('critical hits (fase 26)', () => {
  it('adds the stages of the move, the Leek and Focus Energy or Dragon Cheer', () => {
    const attacker = combatant(sirfetchd);
    const target = combatant(garchomp, 'p2');
    expect(critChance(attacker, target, 'meteorassault')).toBe(1 / 2);
    expect(critChance(attacker, target, 'nightslash')).toBe(1);
    const cheered = withCritBoost(attacker, 'dragoncheer');
    expect(cheered.critBoost).toBe(1);
    expect(critChance(cheered, target, 'meteorassault')).toBe(1);
    expect(critChance(combatant(garchomp), target, 'dragonclaw')).toBe(1 / 24);
    expect(critChance(attacker, combatant(torkoal, 'p2'), 'meteorassault')).toBe(0);
  });

  it('Dragon Cheer gives Dragon types two stages and never stacks with Focus Energy', () => {
    const dragon = withCritBoost(combatant(garchomp), 'dragoncheer');
    expect(dragon.critBoost).toBe(2);
    const cheered = withCritBoost(combatant(sirfetchd), 'dragoncheer');
    expect(withCritBoost(cheered, 'focusenergy')).toBe(cheered);
  });

  it('mixes the critical rolls into the expected damage by their chance', () => {
    const field = emptyField(true);
    const attacker = combatant(sirfetchd);
    const target = combatant(archaludon, 'p2');
    const plain = estimateDamage(attacker, target, 'meteorassault', field);
    const crit = estimateDamage(attacker, target, 'meteorassault', field, { crit: true });
    const mixed = estimateDamage(attacker, target, 'meteorassault', field, { critChance: true });
    expect(mixed.avg).toBeCloseTo((plain.avg + crit.avg) / 2, 6);
    expect(mixed.min).toBe(plain.min);
    expect(mixed.max).toBe(crit.max);
    const always = estimateDamage(
      withCritBoost(attacker, 'dragoncheer'),
      target,
      'meteorassault',
      field,
      {
        critChance: true,
      },
    );
    expect(always.avg).toBe(crit.avg);
    // Stage 0 stays as before: no critical hits in the estimate.
    const base = estimateDamage(combatant(garchomp), target, 'earthquake', field);
    expect(
      estimateDamage(combatant(garchomp), target, 'earthquake', field, { critChance: true }).avg,
    ).toBe(base.avg);
  });
});

describe('critical-hit moves level 2 understands (fase 26)', () => {
  function turnOne(critModel: boolean): Situation {
    const session = scenario('doubles', [archaludon, sirfetchd], [garchomp, torkoal], {
      openTeamSheets: true,
      seed: 'crits',
    });
    const context = session.getAgentContext('p1');
    if (!context) throw new Error('p1 no tiene que elegir');
    return new Situation(context, { critModel });
  }
  const AUTO: SlotPlan = { kind: 'auto' };
  const PASS: SlotPlan = { kind: 'pass' };
  const cheer: SlotPlan = { kind: 'move', move: 'dragoncheer', target: -2 };

  it('Dragon Cheer on a Leek Sirfetch’d is worth more than doing nothing', () => {
    const situation = turnOne(true);
    expect(DoublesSim.evaluate(situation, [cheer, AUTO])).toBeGreaterThan(
      DoublesSim.evaluate(situation, [PASS, AUTO]),
    );
  });

  it('without the crit model, Dragon Cheer is worth nothing (the model before fase 26)', () => {
    const situation = turnOne(false);
    expect(DoublesSim.evaluate(situation, [cheer, AUTO])).toBe(
      DoublesSim.evaluate(situation, [PASS, AUTO]),
    );
  });
});
