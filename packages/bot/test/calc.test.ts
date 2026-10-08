/**
 * Contrast of `@smogon/calc` (generation 0 = Champions) with our data and with the engine:
 * the bots are only as good as their damage estimates.
 */
import { championsStats, type PokemonSet } from '@colleja/core';
import { getMove, getSpecies, listStandardSets, toId } from '@colleja/data';
import { BattleSession } from '@colleja/engine';
import { generateTeam, standardToSet } from '@colleja/teamgen';
import { calculate, Field, Generations, Move, Side } from '@smogon/calc';
import { describe, expect, it } from 'vitest';
import {
  AggressiveAgent,
  emptyField,
  estimateDamage,
  type FieldState,
  makeCombatant,
  megaSpeciesOf,
  Situation,
  toCalcPokemon,
} from '../src/index';

describe('@smogon/calc for Champions', () => {
  it('computes the same stats as core for every standard set (and its Mega)', () => {
    const mismatches: string[] = [];
    for (const mode of ['singles', 'doubles'] as const) {
      for (const standard of listStandardSets(mode)) {
        const set = standardToSet(standard);
        const forms = [standard.species, megaSpeciesOf(set)].filter((s): s is string => !!s);
        for (const species of forms) {
          const calc = toCalcPokemon(makeCombatant({ side: 'p1', set, species })).stats;
          const core = championsStats(set, { species });
          if (JSON.stringify(calc) !== JSON.stringify(core)) {
            mismatches.push(
              `${species}: calc ${JSON.stringify(calc)} ≠ core ${JSON.stringify(core)}`,
            );
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('knows every species, move, item and ability of our data', () => {
    for (const species of ['garchomp', 'aegislash', 'charizardmegay', 'floettemega']) {
      if (!getSpecies(species)) continue;
      const set: PokemonSet = {
        species,
        ability: getSpecies(species)?.abilities[0] ?? '',
        nature: 'serious',
        statPoints: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        moves: [],
      };
      expect(() => toCalcPokemon(makeCombatant({ side: 'p1', set })), species).not.toThrow();
    }
  });

  it('predicts the damage the engine deals (first hits of real battles)', async () => {
    let checked = 0;
    const misses: string[] = [];
    for (let i = 0; checked < 40 && i < 120; i++) {
      const seed = `calc-${i}`;
      const session = BattleSession.create({
        mode: 'singles',
        seed,
        // Open team sheets: the estimate uses the real rival set, so only the calc is tested.
        options: { teamPreview: false, openTeamSheets: true },
        players: {
          p1: { name: 'A', team: generateTeam('singles', { seed: `${seed}:a`, maxMegaStones: 0 }) },
          p2: { name: 'B', team: generateTeam('singles', { seed: `${seed}:b`, maxMegaStones: 0 }) },
        },
      });
      const context = session.getAgentContext('p1');
      if (!context) continue;
      const situation = new Situation(context);
      const attacker = situation.own[0]?.combatant;
      const defender = situation.foeAt(0)?.combatant;
      if (!attacker || !defender) continue;
      // Strongest plain attack: no multi-hit/charge, priority 0.
      const move = attacker.moves
        .filter((id) => {
          const data = getMove(id);
          return (
            data &&
            data.category !== 'Status' &&
            (data.accuracy === true || data.accuracy === 100) &&
            data.multihit === null &&
            data.priority === 0 &&
            !data.flags.includes('charge')
          );
        })
        .sort(
          (a, b) =>
            situation.damage(attacker, defender, b).avg -
            situation.damage(attacker, defender, a).avg,
        )[0];
      if (!move) continue;
      const estimate = situation.damage(attacker, defender, move);
      const slot = (context.request.side.pokemon[0]?.moves.indexOf(move) ?? -1) + 1;

      const before = session.getLog('omniscient').length;
      session.choose('p1', { type: 'actions', actions: [{ type: 'move', move: slot }] });
      const rival = new AggressiveAgent({ seed });
      const rivalContext = session.getAgentContext('p2');
      if (rivalContext) session.choose('p2', rival.choose(rivalContext));
      const lines = session.getLog('omniscient').slice(before);

      const dealt = firstHit(lines, getMove(move)?.name ?? move, defender.maxhp);
      session.dispose();
      if (dealt === null) continue;
      checked++;
      if (dealt < estimate.min || dealt > estimate.max) {
        misses.push(
          `${seed}: ${attacker.species} ${move} → ${defender.species}: ${dealt} ∉ [${estimate.min}, ${estimate.max}]`,
        );
      }
    }
    expect(checked).toBeGreaterThanOrEqual(30);
    // A few mechanics are outside the estimate (resist berries, abilities triggered
    // mid-turn…): allow some, but no systematic error.
    expect(misses.length, misses.join('\n')).toBeLessThanOrEqual(Math.floor(checked * 0.1));
  });
});

describe('estimateDamage calculator options', () => {
  const GARCHOMP: PokemonSet = {
    species: 'garchomp',
    ability: 'roughskin',
    nature: 'jolly',
    statPoints: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
    moves: ['earthquake', 'dragonclaw'],
  };
  const INCINEROAR: PokemonSet = {
    species: 'incineroar',
    ability: 'blaze',
    nature: 'careful',
    statPoints: { hp: 32, atk: 2, def: 16, spa: 0, spd: 16, spe: 0 },
    moves: ['flareblitz'],
  };
  const attacker = makeCombatant({ side: 'p1', set: GARCHOMP });
  const defender = makeCombatant({ side: 'p2', set: INCINEROAR });
  const GEN = Generations.get(0);
  const direct = (move: string, options: { crit?: boolean; field?: Field }) =>
    calculate(
      GEN,
      toCalcPokemon(attacker),
      toCalcPokemon(defender),
      new Move(GEN, move, options.crit ? { isCrit: true } : undefined),
      options.field ?? new Field({ gameType: 'Doubles' }),
    ).range();

  it('critical hits match the calculator and are cached apart', () => {
    const field = emptyField(true);
    const normal = estimateDamage(attacker, defender, 'dragonclaw', field);
    const crit = estimateDamage(attacker, defender, 'dragonclaw', field, { crit: true });
    expect([crit.min, crit.max]).toEqual(direct('Dragon Claw', { crit: true }));
    expect(crit.min).toBeGreaterThan(normal.max);
    expect(estimateDamage(attacker, defender, 'dragonclaw', field).max).toBe(normal.max);
  });

  it('applies Helping Hand on the attacker and Friend Guard on the defender', () => {
    const field: FieldState = {
      ...emptyField(true),
      boosts: { p1: ['helpinghand'], p2: ['friendguard'] },
    };
    const estimate = estimateDamage(attacker, defender, 'dragonclaw', field);
    const expected = direct('Dragon Claw', {
      field: new Field({
        gameType: 'Doubles',
        attackerSide: new Side({ isHelpingHand: true }),
        defenderSide: new Side({ isFriendGuard: true }),
      }),
    });
    expect([estimate.min, estimate.max]).toEqual(expected);
    const plain = estimateDamage(attacker, defender, 'dragonclaw', emptyField(true));
    expect(estimate.max).not.toBe(plain.max);
  });
});

const BOOST_LINES = new Set(['-boost', '-unboost', '-setboost', '-clearboost', '-clearallboost']);

/**
 * Damage of the first hit of p1's `moveName` on p2 in `lines` (omniscient log), or `null`
 * when it cannot be measured cleanly (miss, crit, protect, p2 moved first and changed HP…).
 */
function firstHit(lines: readonly string[], moveName: string, maxhp: number): number | null {
  let hp = maxhp;
  let used = false;
  for (const line of lines) {
    const [, type = '', a = '', b = ''] = line.split('|');
    if (!used) {
      if ((type === '-damage' || type === '-heal') && a.startsWith('p2a'))
        hp = Number(b.split('/')[0]);
      // Stat changes before the hit (the rival moved first: Close Combat, Intimidate…).
      if (BOOST_LINES.has(type)) return null;
      if (type === 'move' && a.startsWith('p1a') && toId(b) === toId(moveName)) {
        if (line.includes('[miss]') || line.includes('[still]')) return null;
        used = true;
      }
      continue;
    }
    if (type === '-crit' || type === '-miss' || type === '-immune' || type === '-activate')
      return null;
    if (type === '-damage' && a.startsWith('p2a')) {
      if (line.includes('[from]')) return null;
      const left = b.includes('fnt') ? 0 : Number(b.split('/')[0]);
      return left === 0 ? null : hp - left; // a KO only bounds the damage from below
    }
    if (type === 'move' || type === 'turn') return null;
  }
  return null;
}
