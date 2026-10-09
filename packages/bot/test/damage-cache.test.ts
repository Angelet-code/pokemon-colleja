/**
 * The caches of `estimateDamage` must give exactly what the calc gives. The one by HP class
 * assumes that, apart from `EXACT_HP_MOVES`, the calc only reads the HP at the thresholds of
 * `hpKey` (full, a third): checked here for every move, ability and item of our data.
 */
import type { PokemonSet } from '@colleja/core';
import {
  type AbilityId,
  getSpecies,
  type ItemId,
  listAbilities,
  listItems,
  listMoves,
  type MoveData,
  type MoveId,
} from '@colleja/data';
import { describe, expect, it } from 'vitest';
import {
  type Combatant,
  EXACT_HP_MOVES,
  emptyField,
  estimateDamage,
  estimateDamageUncached,
  makeCombatant,
} from '../src/index';

function combatant(species: string, side: 'p1' | 'p2', extra: Partial<PokemonSet> = {}): Combatant {
  const set: PokemonSet = {
    species,
    ability: getSpecies(species)?.abilities[0] ?? '',
    nature: 'serious',
    statPoints: { hp: 32, atk: 17, def: 0, spa: 17, spd: 0, spe: 0 },
    moves: [],
    ...extra,
  };
  return makeCombatant({ side, set });
}

const withHp = (base: Combatant, hp: number): Combatant => ({ ...base, hp });

/** Pairs of HP that `hpKey` puts in the same class (the calc reads 0 HP as full). */
function sameClassHp(maxhp: number, attacker: boolean): [number, number][] {
  const third = Math.floor(maxhp / 3);
  const pairs: [number, number][] = [
    [third + 1, maxhp - 1],
    [1, third],
  ];
  if (attacker) pairs.push([0, maxhp]);
  return pairs;
}

type Holder = 'attacker' | 'defender';

/**
 * Moves (other than `EXACT_HP_MOVES`) whose rolls change when the HP of `holders` changes
 * inside an HP class.
 */
function hpSensitive(
  attacker: Combatant,
  defender: Combatant,
  moves: readonly MoveData[],
  holders: readonly Holder[] = ['attacker', 'defender'],
): string[] {
  const field = emptyField(false);
  const found: string[] = [];
  for (const move of moves) {
    if (EXACT_HP_MOVES.has(move.id)) continue;
    for (const holder of holders) {
      const changed = holder === 'attacker' ? attacker : defender;
      for (const [low, high] of sameClassHp(changed.maxhp, holder === 'attacker')) {
        const [a, b] = [low, high].map((hp) => {
          const [x, y] =
            holder === 'attacker'
              ? [withHp(attacker, hp), defender]
              : [attacker, withHp(defender, hp)];
          return estimateDamageUncached(x, y, move.id, field).rolls.join(',');
        });
        if (a !== b) found.push(`${move.id} (${holder} ${low}/${high})`);
      }
    }
  }
  return found;
}

const damaging = listMoves().filter((move) => move.category !== 'Status');
/** One damaging move of each type: enough to trigger the type-based effects (Blaze…). */
const sample = [...new Map(damaging.map((move) => [move.type, move])).values()];

/** HP-sensitive moves of `sample` when the attacker or the defender holds `extra`. */
function heldSensitive(extra: Partial<PokemonSet>, label: string): string[] {
  const attacker = combatant('garchomp', 'p1', extra);
  const defender = combatant('metagross', 'p2', extra);
  return [
    ...hpSensitive(attacker, combatant('metagross', 'p2'), sample, ['attacker']),
    ...hpSensitive(combatant('garchomp', 'p1'), defender, sample, ['defender']),
  ].map((found) => `${label}: ${found}`);
}

describe('damage caches', () => {
  it('no move besides EXACT_HP_MOVES depends on the exact HP', () => {
    const attacker = combatant('garchomp', 'p1');
    const defender = combatant('metagross', 'p2');
    expect(hpSensitive(attacker, defender, damaging)).toEqual([]);
  });

  it('no ability or item depends on the exact HP (only on the thresholds)', () => {
    const found = [
      ...listAbilities().flatMap((ability) =>
        heldSensitive({ ability: ability.id as AbilityId }, ability.id),
      ),
      ...listItems().flatMap((item) => heldSensitive({ item: item.id as ItemId }, item.id)),
    ];
    expect(found).toEqual([]);
  });

  it('gives the same estimates as the calc, whatever was cached before', () => {
    const field = emptyField(false);
    const attacker = combatant('garchomp', 'p1', { ability: 'roughskin' as AbilityId });
    const defender = combatant('dragonite', 'p2', { ability: 'multiscale' as AbilityId });
    const moves = ['earthquake', 'dragonclaw', 'reversal', 'stoneedge', 'firefang'] as MoveId[];
    const hps = (maxhp: number) => [
      maxhp,
      maxhp - 1,
      Math.floor(maxhp / 3) + 1,
      Math.floor(maxhp / 3),
      1,
    ];
    for (const move of moves) {
      for (const a of hps(attacker.maxhp)) {
        for (const d of hps(defender.maxhp)) {
          const args = [withHp(attacker, a), withHp(defender, d), move, field] as const;
          expect(estimateDamage(...args), `${move} ${a}→${d}`).toEqual(
            estimateDamageUncached(...args),
          );
        }
      }
    }
  });
});
