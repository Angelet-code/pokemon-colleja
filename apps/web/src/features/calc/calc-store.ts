/**
 * State of the damage calculator, remembered between visits: the two Pokémon (set + battle
 * state) and the field. The damage itself comes from the server (`POST /api/calc`).
 */
import type { PokemonSet } from '@colleja/core';
import { type GameMode, getMove, getStandardSets, type SpeciesId } from '@colleja/data';
import type { CALC_STATUSES, CalcPokemon, CalcRequest } from '@colleja/protocol';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '../../stores/settings';
import { applyStandardSet, megaOf, newMember } from '../teams/team-draft';

export type CalcStatus = (typeof CALC_STATUSES)[number];
export type CalcBoostStat = 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type CalcWeather = NonNullable<CalcRequest['field']['weather']>;
export type CalcTerrain = NonNullable<CalcRequest['field']['terrain']>;
export type CalcScreen = NonNullable<CalcRequest['field']['screens']>[number];

export interface CalcSide {
  set: PokemonSet;
  mega: boolean;
  hpPercent: number;
  status: CalcStatus | null;
  boosts: Partial<Record<CalcBoostStat, number>>;
}

export interface CalcFieldState {
  mode: GameMode;
  weather: CalcWeather | null;
  terrain: CalcTerrain | null;
  /** Screens on the defender's side. */
  screens: CalcScreen[];
}

interface CalcState {
  attacker: CalcSide;
  defender: CalcSide;
  field: CalcFieldState;
  updateSide(side: 'attacker' | 'defender', change: Partial<CalcSide>): void;
  updateField(change: Partial<CalcFieldState>): void;
  /** Swaps attacker and defender. */
  swap(): void;
}

/** A side with the most offensive standard set of a species (most attacking moves). */
export function standardSide(species: SpeciesId, mode: GameMode = 'singles'): CalcSide {
  const attacks = (moves: readonly string[]) =>
    moves.filter((move) => getMove(move)?.category !== 'Status').length;
  const [standard] = [...getStandardSets(species, mode)].sort(
    (a, b) => attacks(b.moves) - attacks(a.moves),
  );
  const set = standard ? applyStandardSet(newMember(species), standard) : newMember(species);
  return fromSet(set);
}

/** A side for a set (Mega Evolved when it holds its stone). */
export function fromSet(set: PokemonSet): CalcSide {
  return { set, mega: megaOf(set) !== null, hpPercent: 100, status: null, boosts: {} };
}

export const useCalc = create<CalcState>()(
  persist(
    (set) => ({
      attacker: standardSide('garchomp'),
      defender: standardSide('incineroar'),
      field: { mode: 'singles', weather: null, terrain: null, screens: [] },
      updateSide: (side, change) =>
        set((state) => ({ [side]: { ...state[side], ...change } }) as Partial<CalcState>),
      updateField: (change) => set((state) => ({ field: { ...state.field, ...change } })),
      swap: () => set((state) => ({ attacker: state.defender, defender: state.attacker })),
    }),
    { name: 'colleja:calc', storage: createJSONStorage(() => safeStorage()) },
  ),
);

/** The request for one move of the attacker. */
export function calcRequest(
  attacker: CalcSide,
  defender: CalcSide,
  field: CalcFieldState,
  move: string,
): CalcRequest {
  return {
    attacker: toCalcPokemon(attacker),
    defender: toCalcPokemon(defender),
    move,
    field: {
      doubles: field.mode === 'doubles',
      ...(field.weather ? { weather: field.weather } : {}),
      ...(field.terrain ? { terrain: field.terrain } : {}),
      ...(field.screens.length > 0 ? { screens: field.screens } : {}),
    },
  };
}

function toCalcPokemon(side: CalcSide): CalcPokemon {
  const boosts = Object.fromEntries(
    Object.entries(side.boosts).filter(([, value]) => value !== 0 && value !== undefined),
  );
  return {
    set: side.set,
    ...(side.mega && megaOf(side.set) ? { mega: true } : {}),
    ...(side.hpPercent < 100 ? { hpPercent: side.hpPercent } : {}),
    ...(side.status ? { status: side.status } : {}),
    ...(Object.keys(boosts).length > 0 ? { boosts } : {}),
  };
}
