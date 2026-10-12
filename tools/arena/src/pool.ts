/**
 * Team pools for the arena (`--teams`): the saved rivals of a mode (`storage/opponents/`) or
 * every team file of a folder (a saved JSON, a bare `{ members }` JSON or Showdown export text).
 * Read only: what is saved is written by the server's repositories.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SetPriors } from '@colleja/bot';
import { type PokemonSet, parseShowdownTeam } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import { FileMetagameStore } from '@colleja/metagame';
import { PokemonSetSchema } from '@colleja/protocol';

const STORAGE_DIR =
  process.env.STORAGE_DIR ?? fileURLToPath(new URL('../../../storage/', import.meta.url));

/** The keyword of `--teams` for the saved rivals. */
export const SAVED_RIVALS = 'rivales';
/** The keyword of `--teams` (and `--a-priors`/`--b-priors`) for the active metagame. */
export const METAGAME = 'meta';

export interface PoolTeam {
  name: string;
  members: PokemonSet[];
}

/**
 * The saved rivals of `mode`, the teams of the active metagame of `mode`, or the teams of a
 * folder whose mode is `mode` (or unknown).
 */
export function loadPool(reference: string, mode: GameMode): PoolTeam[] {
  if (reference === METAGAME) {
    return activeMetagame()
      .teams.filter((team) => team.mode === mode)
      .map((team) => ({ name: team.name, members: team.members }));
  }
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

/** The sets that are played in `mode`, from the active metagame (fase 22). */
export function loadSetPriors(mode: GameMode): SetPriors {
  const priors = activeMetagame().sets?.[mode];
  if (!priors)
    throw new Error('La instantánea del meta no tiene sets: ejecuta npm run meta:update.');
  return priors;
}

function activeMetagame() {
  const snapshot = new FileMetagameStore(join(STORAGE_DIR, 'metagame')).active();
  if (!snapshot) throw new Error('No hay meta guardado: ejecuta npm run meta:update.');
  return snapshot;
}
