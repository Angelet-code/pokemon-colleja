import { readFileSync } from 'node:fs';
import { type PokemonSet, parseShowdownTeam } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import { generateTeam } from '@colleja/teamgen';
import type { BattleJobResult, BenchOpponent, BenchTeam } from '../src/index';

export function fixtureTeam(name: 'equipo-a' | 'equipo-b'): PokemonSet[] {
  const text = readFileSync(
    new URL(`../../../tools/smoke/fixtures/${name}.txt`, import.meta.url),
    'utf8',
  );
  const { sets, problems } = parseShowdownTeam(text);
  if (problems.length > 0) throw new Error(problems.join('\n'));
  return sets;
}

export const TEAM_A: BenchTeam = { id: 'a', name: 'Equipo A', members: fixtureTeam('equipo-a') };
export const TEAM_B: BenchTeam = { id: 'b', name: 'Equipo B', members: fixtureTeam('equipo-b') };

export function randomOpponents(mode: GameMode, count: number): BenchOpponent[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `rival-${index}`,
    name: `Rival ${index}`,
    members: generateTeam(mode, { seed: `bench-test:${index}` }),
  }));
}

/** A finished battle for the pure tests (scheduler, summary). */
export function outcome(kind: BattleJobResult['outcome']): BattleJobResult {
  return { outcome: kind, turns: 10, ms: 1, invalidChoices: 0, decisionMs: 1, decisions: 1 };
}
