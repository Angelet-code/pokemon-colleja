import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ChaosStats, parseChaos, type StoredReplay } from '../src/index';

/** Trimmed real stats of 2026-09 (40 most used species, short tables). */
export function fixtureStats(mode: 'doubles' | 'singles'): ChaosStats {
  const file = new URL(`./fixtures/chaos-${mode}.json`, import.meta.url);
  return parseChaos(JSON.parse(readFileSync(file, 'utf8')));
}

export const tempDir = (prefix: string) => mkdtempSync(join(tmpdir(), `colleja-${prefix}-`));

/** Three doubles archetypes as team preview names. */
export const ARCHETYPES = {
  floette: ['Floette-Eternal', 'Incineroar', 'Rillaboom', 'Sneasler', 'Garchomp', 'Gholdengo'],
  rain: ['Archaludon', 'Pelipper', 'Golisopod', 'Grimmsnarl', 'Swampert', 'Farigiraf'],
  sun: ['Charizard', 'Venusaur', 'Garchomp', 'Archaludon', 'Grimmsnarl', 'Politoed'],
} as const;

/** Swaps member `slot` for `other` (a variation of the same archetype). */
export const variant = (team: readonly string[], slot: number, other: string) =>
  team.map((species, index) => (index === slot ? other : species));

let counter = 0;

/** A replay with only its team preview (both sides). */
export function replay(
  p1: readonly string[],
  p2: readonly string[],
  options: { rating?: number; uploadtime?: number } = {},
): StoredReplay {
  counter++;
  const poke = (side: string, team: readonly string[]) =>
    team.map((species) => `|poke|${side}|${species}, L50|`);
  return {
    id: `gen9championsvgc2026regmc-${1000 + counter}`,
    format: '[Gen 9 Champions] VGC 2026 Reg M-C',
    formatid: 'gen9championsvgc2026regmc',
    players: ['Jugador 1', 'Jugador 2'],
    log: [
      '|clearpoke',
      ...poke('p1', p1),
      ...poke('p2', p2),
      '|teampreview|4',
      '|turn|1',
      `|poke|p1|Pikachu, L50|`,
    ].join('\n'),
    uploadtime: options.uploadtime ?? 1_790_000_000 + counter,
    rating: options.rating ?? 1600,
  };
}
