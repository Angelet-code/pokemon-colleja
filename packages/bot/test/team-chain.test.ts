import { describe, expect, it } from 'vitest';
import {
  makeCombatant,
  recentSwitches,
  Situation,
  stillPromising,
  teamChainValue,
} from '../src/index';
import { scenario, set } from './helpers';

const garchomp = set('garchomp', ['earthquake', 'dragonclaw', 'rockslide', 'protect'], {
  item: 'lifeorb',
  nature: 'jolly',
  spread: { hp: 2, atk: 32, spa: 0, spe: 32 },
});
const ampharos = set('ampharos', ['thunderbolt', 'dazzlinggleam', 'focusblast', 'voltswitch'], {
  nature: 'bold',
  spread: { hp: 32, def: 32, atk: 0, spa: 2 },
});
const weavile = set('weavile', ['tripleaxel', 'iceshard', 'knockoff', 'protect'], {
  nature: 'jolly',
  spread: { hp: 2, atk: 32, spa: 0, spe: 32 },
});

function situation(): Situation {
  const context = scenario('singles', [garchomp], [ampharos]).getAgentContext('p1');
  if (!context) throw new Error('p1 no tiene que elegir');
  return new Situation(context);
}

describe('teamChainValue', () => {
  it('counts every remaining Pokémon of both sides', () => {
    const board = situation();
    const mine = makeCombatant({ side: 'p1', set: garchomp });
    const theirs = makeCombatant({ side: 'p2', set: ampharos });
    const answer = makeCombatant({ side: 'p2', set: weavile });

    // Nothing to fight: the own HP left, × 100.
    expect(teamChainValue(board, [mine], [])).toBe(100);
    // Garchomp beats Ampharos, but Weavile answers Garchomp.
    const alone = teamChainValue(board, [mine], [theirs]);
    expect(alone).toBeGreaterThan(0);
    expect(teamChainValue(board, [mine], [theirs, answer])).toBeLessThan(alone);
    // Deterministic.
    expect(teamChainValue(board, [mine], [theirs, answer])).toBe(
      teamChainValue(board, [mine], [theirs, answer]),
    );
  });
});

describe('recentSwitches', () => {
  const log = [
    '|switch|p1a: Garchomp|Garchomp, L50|185/185',
    '|switch|p2a: Ampharos|Ampharos, L50|100/100',
    '|turn|1',
    '|switch|p1a: Swampert|Swampert, L50|207/207',
    '|turn|2',
    '|move|p2a: Ampharos|Thunderbolt|p1a: Swampert',
    '|faint|p1a: Swampert',
    '|switch|p1a: Garchomp|Garchomp, L50|185/185',
    '|turn|3',
    '|switch|p1a: Sneasler|Sneasler, L50|157/157',
    '|switch|p2a: Weavile|Weavile, L50|100/100',
    '|turn|4',
  ];

  it('counts voluntary switches only (no leads, no replacements after a faint)', () => {
    expect(recentSwitches(log, 'p1', 4)).toBe(2);
    expect(recentSwitches(log, 'p1', 1)).toBe(1);
    expect(recentSwitches(log, 'p2', 4)).toBe(1);
  });
});

describe('stillPromising (successive pruning of the level 3 search)', () => {
  it('keeps the options within the margin of the best average', () => {
    const totals = [
      { sum: 100, count: 2 }, // 50
      { sum: 50, count: 2 }, // 25
      { sum: 80, count: 2 }, // 40
      { sum: 0, count: 0 }, // never played (its choice was rejected)
    ];
    expect(stillPromising([0, 1, 2, 3], totals, 10)).toEqual([0, 2]);
    expect(stillPromising([0, 1, 2, 3], totals, 30)).toEqual([0, 1, 2]);
    expect(stillPromising([1, 2], totals, 0)).toEqual([2]);
  });
});
