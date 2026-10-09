/**
 * What each of your moves would do to the rival's active Pokémon: type effectiveness (from
 * `@colleja/data`) and the damage range from the server calculator (`POST /api/calc`). It is
 * built like "Calcular" (`calcFromBattle`), so it only uses what you can see.
 */
import type { BattleView, PokemonSet, ViewPokemon } from '@colleja/core';
import { currentTypes } from '@colleja/core';
import {
  type GameMode,
  getMove,
  getTypeEffectiveness,
  type MoveId,
  TYPE_NAMES,
  type TypeName,
} from '@colleja/data';
import type { CalcRequest, CalcResponse } from '@colleja/protocol';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { calcRequest } from '../calc/calc-store';
import { calcFromBattle } from '../calc/from-battle';

export interface EstimateContext {
  mode: GameMode;
  /** Your sets (`battle:started`). */
  team: readonly PokemonSet[];
  /** The rival's sets: only with open team sheets. */
  opponentTeam: readonly PokemonSet[] | null;
}

/** A rival on the field and its position (1-based, as in the targets of a choice). */
export interface RivalTarget {
  position: number;
  pokemon: ViewPokemon;
}

export function rivalTargets(view: BattleView): RivalTarget[] {
  return view.sides.p2.active.flatMap((pokemon, index) =>
    pokemon && !pokemon.fainted ? [{ position: index + 1, pokemon }] : [],
  );
}

/**
 * Type multiplier of a damaging move against a Pokémon (null for status moves). With the
 * calculator's answer it uses the type the move ends up with (Pixilate, Weather Ball…), and a
 * damaging move that does nothing is an immunity by ability (Levitate, Water Absorb…).
 */
export function moveEffectiveness(
  move: MoveId,
  defender: ViewPokemon,
  result?: CalcResponse,
): number | null {
  const data = getMove(move);
  if (!data || data.category === 'Status') return null;
  if (result && result.max === 0 && data.basePower > 0) return 0;
  const type = isTypeName(result?.moveType) ? result.moveType : data.type;
  const types = currentTypes(defender);
  let multiplier = getTypeEffectiveness(type, types);
  // The two moves whose effectiveness is not just their type.
  if (move === 'freezedry' && types.includes('Water')) multiplier *= 4;
  if (move === 'flyingpress') multiplier *= getTypeEffectiveness('Flying', types);
  return multiplier;
}

export function isTypeName(type: string | undefined): type is TypeName {
  return (TYPE_NAMES as readonly string[]).includes(type ?? '');
}

export const estimateKey = (move: MoveId, position: number) => `${move}:${position}`;

/** The calculator requests of the damaging moves of one of your active Pokémon. */
export function moveCalcRequests(input: {
  view: BattleView;
  context: EstimateContext;
  /** 0-based position of your attacker. */
  attackerIndex: number;
  moves: readonly MoveId[];
  mega: boolean;
}): Map<string, CalcRequest> {
  const { view, context, attackerIndex, moves, mega } = input;
  const requests = new Map<string, CalcRequest>();
  const attacker = view.sides.p1.active[attackerIndex];
  if (!attacker || attacker.fainted) return requests;
  for (const { position, pokemon: defender } of rivalTargets(view)) {
    let setup: ReturnType<typeof calcFromBattle>;
    try {
      setup = calcFromBattle({ view, ...context, matchup: { attacker, defender } });
    } catch {
      // Your set is not found (e.g. a transformed Pokémon): no estimate.
      continue;
    }
    const attackerSide = mega ? { ...setup.attacker, mega: true } : setup.attacker;
    for (const move of moves) {
      if (moveEffectiveness(move, defender) === null) continue;
      requests.set(
        estimateKey(move, position),
        calcRequest(attackerSide, setup.defender, setup.field, move),
      );
    }
  }
  return requests;
}

/** Same request → same answer: toggling the Mega back and forth does not ask again. */
const cache = new Map<string, Promise<CalcResponse | null>>();
const CACHE_LIMIT = 200;

function cachedCalc(request: CalcRequest): Promise<CalcResponse | null> {
  const key = JSON.stringify(request);
  let result = cache.get(key);
  if (!result) {
    result = api.calc(request).catch(() => null);
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(key, result);
  }
  return result;
}

/** Damage estimates by `estimateKey`; they arrive as the server answers. */
export function useMoveEstimates(
  requests: Map<string, CalcRequest> | null,
): Record<string, CalcResponse> {
  const [estimates, setEstimates] = useState<Record<string, CalcResponse>>({});
  const signature = requests ? JSON.stringify([...requests]) : '';
  // biome-ignore lint/correctness/useExhaustiveDependencies: `signature` stands for `requests`.
  useEffect(() => {
    setEstimates({});
    if (!requests) return;
    let current = true;
    for (const [key, request] of requests) {
      void cachedCalc(request).then((result) => {
        if (current && result) setEstimates((previous) => ({ ...previous, [key]: result }));
      });
    }
    return () => {
      current = false;
    };
  }, [signature]);
  return estimates;
}
