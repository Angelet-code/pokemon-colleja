import { readFileSync } from 'node:fs';
import { type PokemonSet, parseShowdownTeam } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import { type BattleConfig, BattleSession } from '../src/index';

/** The smoke fixtures double as the default teams of the CLI. */
export function fixtureTeam(name: 'equipo-a' | 'equipo-b'): PokemonSet[] {
  const text = readFileSync(
    new URL(`../../../tools/smoke/fixtures/${name}.txt`, import.meta.url),
    'utf8',
  );
  const { sets, problems } = parseShowdownTeam(text);
  if (problems.length > 0) throw new Error(problems.join('\n'));
  return sets;
}

export function fixtureConfig(mode: GameMode, seed: string, extra: Partial<BattleConfig> = {}) {
  return {
    mode,
    seed,
    players: {
      p1: { name: 'Equipo A', team: fixtureTeam('equipo-a') },
      p2: { name: 'Equipo B', team: fixtureTeam('equipo-b') },
    },
    ...extra,
  } satisfies BattleConfig;
}

export function createFixtureSession(mode: GameMode, seed: string, extra?: Partial<BattleConfig>) {
  return BattleSession.create(fixtureConfig(mode, seed, extra));
}
