import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const GENERATED_DIR = join(ROOT, 'packages', 'data', 'generated');
export const OVERRIDES_DIR = join(ROOT, 'packages', 'data', 'overrides');
export const CACHE_DIR = join(ROOT, 'tools', 'data-pipeline', '.cache');
export const SPRITES_DIR = join(ROOT, 'assets', 'sprites');

/** Regulation the pinned Showdown commit implements. Update together with the submodule. */
export const REGULATION = 'M-C';

/** PokeAPI language id for Spanish (see languages.csv). */
export const POKEAPI_SPANISH = 7;

interface Sources {
  pokeapi: { repo: string; commit: string; csvPath: string };
  sprites: { repo: string; commit: string };
}

/** Pinned external sources (tools/data-pipeline/sources.json). */
export const SOURCES = JSON.parse(
  readFileSync(new URL('../sources.json', import.meta.url), 'utf8'),
) as Sources;

export function rawGithubUrl(repo: string, commit: string, path: string): string {
  return `https://raw.githubusercontent.com/${repo}/${commit}/${path}`;
}
