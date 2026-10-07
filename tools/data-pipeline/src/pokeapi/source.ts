import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_DIR, rawGithubUrl, SOURCES } from '../config';
import { parseCsvRecords } from './csv';

/**
 * Loads a PokeAPI CSV table at the pinned commit, from GitHub (pokeapi.co is not needed).
 * Files are cached under tools/data-pipeline/.cache, keyed by commit.
 */
export async function loadPokeApiCsv(table: string): Promise<Record<string, string>[]> {
  const { repo, commit, csvPath } = SOURCES.pokeapi;
  const cacheFile = join(CACHE_DIR, 'pokeapi', commit, `${table}.csv`);

  if (!existsSync(cacheFile)) {
    const url = rawGithubUrl(repo, commit, `${csvPath}/${table}.csv`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`PokeAPI: ${response.status} al descargar ${url}`);
    mkdirSync(join(CACHE_DIR, 'pokeapi', commit), { recursive: true });
    writeFileSync(cacheFile, await response.text());
  }
  return parseCsvRecords(readFileSync(cacheFile, 'utf8'));
}
