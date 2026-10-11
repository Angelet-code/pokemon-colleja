/**
 * Team pools for the arena (`--teams`): the saved rivals of a mode (`storage/opponents/`) or
 * every team file of a folder (a saved JSON, a bare `{ members }` JSON or Showdown export text).
 * Read only: what is saved is written by the server's repositories.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type PokemonSet, parseShowdownTeam } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import { PokemonSetSchema } from '@colleja/protocol';

const STORAGE_DIR =
  process.env.STORAGE_DIR ?? fileURLToPath(new URL('../../../storage/', import.meta.url));

/** The keyword of `--teams` for the saved rivals. */
export const SAVED_RIVALS = 'rivales';

export interface PoolTeam {
  name: string;
  members: PokemonSet[];
}

/** The saved rivals of `mode`, or the teams of a folder whose mode is `mode` (or unknown). */
export function loadPool(reference: string, mode: GameMode): PoolTeam[] {
  const dir = reference === SAVED_RIVALS ? join(STORAGE_DIR, 'opponents') : reference;
  if (!existsSync(dir)) throw new Error(`No existe la carpeta "${dir}".`);
  return readdirSync(dir)
    .filter((file) => /\.(json|txt)$/.test(file))
    .sort()
    .flatMap((file) => {
      const team = readTeam(join(dir, file));
      return team && (team.mode === undefined || team.mode === mode)
        ? [{ name: team.name, members: team.members }]
        : [];
    });
}

function readTeam(path: string): (PoolTeam & { mode?: GameMode }) | null {
  const text = readFileSync(path, 'utf8');
  const name = path.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  if (!text.trimStart().startsWith('{')) {
    const { sets, problems } = parseShowdownTeam(text);
    return problems.length === 0 ? { name, members: sets } : null;
  }
  const data = JSON.parse(text) as Record<string, unknown>;
  const inner = (data.opponent ?? data.team ?? data) as Record<string, unknown>;
  const members = PokemonSetSchema.array().safeParse(inner.members);
  if (!members.success) return null;
  const mode = inner.mode === 'singles' || inner.mode === 'doubles' ? inner.mode : undefined;
  return {
    name: typeof inner.name === 'string' ? inner.name : name,
    members: members.data,
    ...(mode ? { mode } : {}),
  };
}
