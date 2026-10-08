/**
 * Teams and rivals for the bench CLI: saved ones (by id or name, read from `storage/`) or
 * files (a saved JSON, a bare `{ members }` JSON or Showdown export text). Read only: what is
 * saved is written by the server's repositories.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BenchOpponent, BenchTeam } from '@colleja/bench';
import { parseShowdownTeam } from '@colleja/core';
import type { GameMode } from '@colleja/data';
import { PokemonSetSchema, SavedOpponentSchema, TeamSchema } from '@colleja/protocol';
import { z } from 'zod';

export const STORAGE_DIR =
  process.env.STORAGE_DIR ?? fileURLToPath(new URL('../../../storage/', import.meta.url));

const MembersSchema = z.object({ members: z.array(PokemonSetSchema) });

interface SavedEntry extends BenchTeam {
  mode: GameMode;
}

function readSaved(folder: 'teams' | 'opponents'): SavedEntry[] {
  const dir = join(STORAGE_DIR, folder);
  if (!existsSync(dir)) return [];
  const schema = folder === 'teams' ? TeamSchema : SavedOpponentSchema;
  const key = folder === 'teams' ? 'team' : 'opponent';
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      const data = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, unknown>;
      const id = file.slice(0, -'.json'.length);
      const parsed = schema.safeParse({ ...(data[key] as object), id });
      return parsed.success
        ? [{ id, name: parsed.data.name, mode: parsed.data.mode, members: parsed.data.members }]
        : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const normalize = (text: string) => text.normalize('NFC').toLowerCase().trim();

/** A team from a file, or a saved team by id or by name. */
export function loadTeam(reference: string): BenchTeam {
  if (existsSync(reference)) return readTeamFile(reference);
  const saved = readSaved('teams').find(
    (team) => team.id === reference || normalize(team.name) === normalize(reference),
  );
  if (!saved) throw new Error(`No encuentro el equipo "${reference}" (ni fichero ni guardado).`);
  return saved;
}

function readTeamFile(path: string): BenchTeam {
  const text = readFileSync(path, 'utf8');
  const name = basename(path).replace(/\.[^.]+$/, '');
  if (text.trimStart().startsWith('{')) {
    const data = JSON.parse(text) as Record<string, unknown>;
    const inner = (data.team ?? data.opponent ?? data) as Record<string, unknown>;
    const { members } = MembersSchema.parse(inner);
    return { id: name, name: typeof inner.name === 'string' ? inner.name : name, members };
  }
  const { sets, problems } = parseShowdownTeam(text);
  if (problems.length > 0) throw new Error(`${path}:\n  ${problems.join('\n  ')}`);
  return { id: name, name, members: sets };
}

/**
 * Saved rivals: `all` (those whose preferred mode is one of `modes`) or a comma-separated list
 * of ids or names.
 */
export function loadOpponents(reference: string, modes: readonly GameMode[]): BenchOpponent[] {
  const saved = readSaved('opponents');
  if (reference === 'all') {
    return saved
      .filter((opponent) => modes.includes(opponent.mode))
      .map(({ mode: _, ...opponent }) => opponent);
  }
  return reference.split(',').map((part) => {
    const found = saved.find(
      (opponent) => opponent.id === part.trim() || normalize(opponent.name) === normalize(part),
    );
    if (!found) throw new Error(`No encuentro el rival "${part}".`);
    const { mode: _, ...opponent } = found;
    return opponent;
  });
}
