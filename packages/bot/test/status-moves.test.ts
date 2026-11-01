import type { PokemonSet } from '@colleja/core';
import { getMove, listStandardSets } from '@colleja/data';
import { describe, expect, it } from 'vitest';
import { DoublesSim, type SimTrace, type SlotPlan } from '../src/analysis/doubles-sim';
import * as knowledge from '../src/analysis/move-knowledge';
import { Situation } from '../src/analysis/situation';
import { scenario, set } from './helpers';

/** Level 2's situation on turn 1 (p1 leads with the first two sets), with or without fase 24. */
function turnOne(p1: PokemonSet[], p2: PokemonSet[], statusModel = true): Situation {
  const session = scenario('doubles', p1, p2, { openTeamSheets: true, seed: 'status' });
  const context = session.getAgentContext('p1');
  if (!context) throw new Error('p1 no tiene que elegir');
  return new Situation(context, { statusModel });
}

/** Share of max HP the rivals take away from the bot's leads when it plays `plans`. */
function rivalDamage(situation: Situation, plans: SlotPlan[]): number {
  const mine = situation.own.slice(0, 2).map((member) => member.combatant);
  const foe = situation.foes.filter((rival) => rival.position !== null).map((r) => r.combatant);
  const trace: SimTrace = { events: [], damage: [] };
  DoublesSim.evaluateLineup(situation, { mine, foe }, plans, trace);
  return trace.damage
    .filter((entry) => entry.side === 'foe')
    .reduce((sum, entry) => sum + entry.share, 0);
}

const PASS: SlotPlan = { kind: 'pass' };
const AUTO: SlotPlan = { kind: 'auto' };
const move = (id: string, target?: number): SlotPlan => ({
  kind: 'move',
  move: id,
  ...(target !== undefined ? { target } : {}),
});

const wyrdeer = set('wyrdeer', ['skillswap', 'protect', 'psychic', 'earthpower'], {
  ability: 'intimidate',
  item: 'mentalherb',
});
const incineroar = set('incineroar', ['fakeout', 'partingshot', 'flareblitz', 'protect'], {
  ability: 'intimidate',
  item: 'sitrusberry',
});
const physical = [
  set('garchomp', ['earthquake', 'rockslide', 'dragonclaw', 'protect'], { item: 'yacheberry' }),
  set('excadrill', ['ironhead', 'rockslide', 'highhorsepower', 'protect'], { item: 'focussash' }),
];

describe('status moves level 2 understands (fase 24)', () => {
  it('Skill Swap between two Intimidate users is worth more than doing nothing', () => {
    const situation = turnOne([wyrdeer, incineroar], physical);
    const swap = DoublesSim.evaluate(situation, [move('skillswap', -2), AUTO]);
    const pass = DoublesSim.evaluate(situation, [PASS, AUTO]);
    expect(swap).toBeGreaterThan(pass);
  });

  it('without the status model, Skill Swap is worth nothing (the model before fase 24)', () => {
    const situation = turnOne([wyrdeer, incineroar], physical, false);
    const swap = DoublesSim.evaluate(situation, [move('skillswap', -2), AUTO]);
    const pass = DoublesSim.evaluate(situation, [PASS, AUTO]);
    expect(swap).toBe(pass);
  });

  it('Intimidate does nothing to Clear Body and powers up Defiant', () => {
    const clearBody = [
      set('metagross', ['zenheadbutt', 'bulletpunch', 'earthquake', 'protect'], {
        ability: 'clearbody',
        item: 'yacheberry',
      }),
      set('garganacl', ['saltcure', 'rockslide', 'earthquake', 'protect'], {
        ability: 'clearbody',
        item: 'focussash',
      }),
    ];
    const immune = turnOne([wyrdeer, incineroar], clearBody);
    expect(rivalDamage(immune, [move('skillswap', -2), PASS])).toBe(
      rivalDamage(immune, [PASS, PASS]),
    );

    // Weak attackers, so that nobody falls and every point of Attack shows in the damage.
    const weak = { hp: 32, atk: 0, def: 32, spa: 0, spd: 2 };
    const defiant = [
      set('farfetchd', ['leafblade', 'knockoff', 'swordsdance', 'protect'], {
        ability: 'defiant',
        item: 'yacheberry',
        spread: weak,
      }),
      set('passimian', ['knockoff', 'uturn', 'bulkup', 'protect'], {
        ability: 'defiant',
        item: 'focussash',
        spread: weak,
      }),
    ];
    // Sableye (Prankster) swaps before the rivals can knock it out.
    const sableye = set('sableye', ['skillswap', 'willowisp', 'encore', 'protect'], {
      ability: 'prankster',
      item: 'mentalherb',
    });
    const punished = turnOne([sableye, incineroar], defiant);
    expect(rivalDamage(punished, [move('skillswap', -2), PASS])).toBeGreaterThan(
      rivalDamage(punished, [PASS, PASS]),
    );
  });

  it('Prankster makes Skill Swap land before the rivals attack', () => {
    const sableye = (ability: string) =>
      set('sableye', ['skillswap', 'willowisp', 'encore', 'protect'], {
        ability,
        item: 'mentalherb',
      });
    const value = (ability: string) =>
      DoublesSim.evaluate(turnOne([sableye(ability), incineroar], physical), [
        move('skillswap', -2),
        AUTO,
      ]);
    expect(value('prankster')).toBeGreaterThan(value('keeneye'));
  });

  it('Wide Guard stops the rivals spread moves', () => {
    const guard = set('machamp', ['wideguard', 'closecombat', 'rockslide', 'protect'], {
      ability: 'noguard',
      item: 'mentalherb',
    });
    const spread = [
      set('garchomp', ['earthquake', 'rockslide', 'protect', 'dragonclaw'], { item: 'yacheberry' }),
      set('tyranitar', ['rockslide', 'crunch', 'protect', 'lowkick'], {
        ability: 'unnerve',
        item: 'focussash',
      }),
    ];
    const situation = turnOne([guard, incineroar], spread);
    expect(DoublesSim.evaluate(situation, [move('wideguard'), AUTO])).toBeGreaterThan(
      DoublesSim.evaluate(situation, [PASS, AUTO]),
    );
  });

  it('Fake Tears on a rival helps the ally special attacker', () => {
    const tears = set('jolteon', ['faketears', 'thunderbolt', 'protect', 'voltswitch'], {
      item: 'mentalherb',
    });
    const special = set('sylveon', ['hypervoice', 'moonblast', 'protect', 'calmmind'], {
      ability: 'pixilate',
      item: 'sitrusberry',
    });
    // Bulky rivals: nobody falls on turn 1, so the drop shows in the follow-up turns.
    const bulky = [
      set('snorlax', ['bodyslam', 'highhorsepower', 'curse', 'protect'], { item: 'yacheberry' }),
      set('avalugg', ['avalanche', 'bodypress', 'recover', 'protect'], { item: 'focussash' }),
    ];
    const situation = turnOne([tears, special], bulky);
    expect(DoublesSim.evaluate(situation, [move('faketears', 2), AUTO])).toBeGreaterThan(
      DoublesSim.evaluate(situation, [PASS, AUTO]),
    );
  });
});

describe('status move coverage', () => {
  const modelled = new Set<string>(['tailwind', 'trickroom', 'helpinghand']);
  const tables: unknown[] = [
    knowledge.PROTECT_MOVES,
    knowledge.FIRST_TURN_MOVES,
    knowledge.SETUP_MOVES,
    knowledge.STATUS_MOVES,
    knowledge.RECOVERY_MOVES,
    knowledge.SCREEN_MOVES,
    knowledge.REDIRECTION_MOVES,
    knowledge.SELF_KO_MOVES,
    knowledge.TARGET_BOOST_MOVES,
    knowledge.ABILITY_MOVES,
    knowledge.WEATHER_MOVES,
    knowledge.GUARD_MOVES,
    knowledge.HEAL_TARGET_MOVES,
    knowledge.LOCK_MOVES,
    knowledge.CRIT_BOOST_MOVES,
  ];
  const ids = (table: unknown) =>
    (table instanceof Set ? [...table] : Object.keys(table as object)) as string[];
  for (const table of tables) for (const id of ids(table)) modelled.add(id);

  it('every status move of the standard sets is modelled or listed as not modelled', () => {
    const missing = new Set<string>();
    for (const mode of ['singles', 'doubles'] as const) {
      for (const standard of listStandardSets(mode)) {
        for (const id of standard.moves) {
          if (getMove(id)?.category !== 'Status') continue;
          if (!modelled.has(id) && !(id in knowledge.UNMODELLED_STATUS_MOVES)) missing.add(id);
        }
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('the fase 24 and 26 tables only name moves of Champions', () => {
    const fase24 = [
      knowledge.TARGET_BOOST_MOVES,
      knowledge.ABILITY_MOVES,
      knowledge.WEATHER_MOVES,
      knowledge.GUARD_MOVES,
      knowledge.HEAL_TARGET_MOVES,
      knowledge.LOCK_MOVES,
      knowledge.CRIT_BOOST_MOVES,
      knowledge.UNMODELLED_STATUS_MOVES,
    ];
    const unknown = fase24.flatMap(ids).filter((id) => !getMove(id));
    expect(unknown).toEqual([]);
  });
});
