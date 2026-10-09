import { BattleView, type PokemonSet } from '@colleja/core';
import type { CalcResponse } from '@colleja/protocol';
import { describe, expect, it } from 'vitest';
import {
  estimateKey,
  moveCalcRequests,
  moveEffectiveness,
  rivalTargets,
} from '../src/features/battle/move-estimates';

const GARCHOMP: PokemonSet = {
  species: 'garchomp',
  item: 'garchompite',
  ability: 'roughskin',
  nature: 'jolly',
  statPoints: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
  moves: ['earthquake', 'dragonclaw', 'rockslide', 'protect'],
};

const VIEW = BattleView.from([
  '|gametype|doubles',
  '|player|p1|Yo|',
  '|player|p2|Bot|',
  '|start',
  '|switch|p1a: Garchomp|Garchomp, L50, M|185/185',
  '|switch|p2a: Incineroar|Incineroar, L50, M|100/100',
  '|switch|p2b: Corviknight|Corviknight, L50, F|50/100',
  '|turn|1',
]);
const CONTEXT = { mode: 'doubles' as const, team: [GARCHOMP], opponentTeam: null };

describe('move estimates', () => {
  it('rates the type of damaging moves against each rival', () => {
    const [incineroar, corviknight] = rivalTargets(VIEW);
    if (!incineroar || !corviknight) throw new Error('faltan rivales');
    expect(moveEffectiveness('earthquake', incineroar.pokemon)).toBe(2);
    expect(moveEffectiveness('earthquake', corviknight.pokemon)).toBe(0);
    expect(moveEffectiveness('rockslide', corviknight.pokemon)).toBe(1);
    expect(moveEffectiveness('protect', incineroar.pokemon)).toBeNull();
  });

  it('follows the calculator: the final type and immunities by ability', () => {
    const [incineroar, corviknight] = rivalTargets(VIEW);
    if (!incineroar || !corviknight) throw new Error('faltan rivales');
    const result = (moveType: string, max: number) =>
      ({ moveType, max }) as unknown as CalcResponse;
    // Pixilate: Hyper Voice turns Fairy.
    expect(moveEffectiveness('hypervoice', corviknight.pokemon, result('Fairy', 50))).toBe(0.5);
    // A damaging move that does nothing (e.g. into Flash Fire).
    expect(moveEffectiveness('flamethrower', incineroar.pokemon, result('Fire', 0))).toBe(0);
  });

  it('asks the calculator for each damaging move and rival, with what you can see', () => {
    const requests = moveCalcRequests({
      view: VIEW,
      context: CONTEXT,
      attackerIndex: 0,
      moves: GARCHOMP.moves,
      mega: true,
    });
    // Protect is a status move: no request.
    expect([...requests.keys()].sort()).toEqual(
      ['dragonclaw', 'earthquake', 'rockslide']
        .flatMap((move) => [estimateKey(move, 1), estimateKey(move, 2)])
        .sort(),
    );
    const request = requests.get(estimateKey('earthquake', 2));
    expect(request?.attacker).toMatchObject({ set: GARCHOMP, mega: true });
    expect(request?.defender.hpPercent).toBe(50);
    expect(request?.field.doubles).toBe(true);
  });

  it('gives up without your set (no estimate rather than a wrong one)', () => {
    const requests = moveCalcRequests({
      view: VIEW,
      context: { ...CONTEXT, team: [] },
      attackerIndex: 0,
      moves: GARCHOMP.moves,
      mega: false,
    });
    expect(requests.size).toBe(0);
  });
});
