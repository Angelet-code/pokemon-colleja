/**
 * Official Spanish in-game descriptions that PokeAPI lacks, read from text dumps of the games
 * (pinned in sources.json):
 *  - Scarlet/Violet (`svText`): moves, abilities and items of the base game.
 *  - Legends: Z-A (`zaText`): abilities and items (its new Mega Stones and their abilities).
 *    Not moves: Z-A describes them with its own battle system.
 *
 * Entries are matched by official Spanish name (each dump keeps a name and its description
 * at the same index), so no internal number has to agree with Showdown's.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DescriptionKind } from '@colleja/data/schema';
import { CACHE_DIR, rawGithubUrl, SOURCES } from '../config';

/** Description by official Spanish name, per kind. */
export type DescriptionsByName = Record<DescriptionKind, Map<string, string>>;

export interface OfficialTexts {
  /** Dumps in the order they are tried. */
  sources: { label: string; descriptions: DescriptionsByName }[];
}

/** Game files of each dump: name file and description file, per kind. */
const SV_FILES: Record<DescriptionKind, [string, string]> = {
  moves: ['wazaname.dat', 'wazainfo.dat'],
  abilities: ['tokusei.dat', 'tokuseiinfo.dat'],
  items: ['itemname.dat', 'iteminfo.dat'],
};
const ZA_FILES: Partial<Record<DescriptionKind, [string, string]>> = {
  abilities: ['tokusei', 'tokuseiinfo'],
  items: ['itemname', 'iteminfo'],
};

export async function loadOfficialTexts(): Promise<OfficialTexts> {
  const { svText, zaText } = SOURCES;
  const sv = parseSvDump(await cachedText('sv-text', svText.repo, svText.commit, svText.file));
  const svDescriptions = emptyDescriptions();
  for (const [kind, [names, infos]] of Object.entries(SV_FILES) as [
    DescriptionKind,
    [string, string],
  ][]) {
    svDescriptions[kind] = descriptionsByName(sv.get(names), sv.get(infos));
  }

  const zaDescriptions = emptyDescriptions();
  for (const [kind, files] of Object.entries(ZA_FILES) as [DescriptionKind, [string, string]][]) {
    const [names, infos] = await Promise.all(
      files.map(async (file) =>
        parseZaFile(
          await cachedText('za-text', zaText.repo, zaText.commit, `${zaText.dir}/${file}.txt`),
        ),
      ),
    );
    zaDescriptions[kind] = descriptionsByName(names, infos);
  }

  return {
    sources: [
      { label: 'Escarlata/Púrpura', descriptions: svDescriptions },
      { label: 'Leyendas Z-A', descriptions: zaDescriptions },
    ],
  };
}

/**
 * Scarlet/Violet dump: one file with sections (`Text File : name.dat` between `~~~` lines),
 * one line per index.
 */
export function parseSvDump(text: string): Map<string, Map<number, string>> {
  const files = new Map<string, Map<number, string>>();
  const lines = text.split(/\r?\n/);
  let current: Map<number, string> | null = null;
  let index = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const header = /^Text File : (.+)$/.exec(line);
    if (header?.[1] && lines[i - 1]?.startsWith('~~~') && lines[i + 1]?.startsWith('~~~')) {
      current = new Map();
      files.set(header[1], current);
      index = 0;
      i++;
      continue;
    }
    if (line.startsWith('~~~') && lines[i + 1]?.startsWith('Text File : ')) continue;
    if (current) current.set(index++, line);
  }
  return files;
}

/** Legends: Z-A dump: one file per game file, `index<TAB>hash<TAB>label<TAB>text` per line. */
export function parseZaFile(text: string): Map<number, string> {
  const entries = new Map<number, string>();
  for (const line of text.split(/\r?\n/)) {
    const [index, , , value] = line.split('\t');
    if (index !== undefined && value !== undefined && /^\d+$/.test(index)) {
      entries.set(Number(index), value);
    }
  }
  return entries;
}

/**
 * Pairs each name with the description at its index. Names that appear twice with different
 * descriptions are dropped (ambiguous), and so are placeholders and texts with variables.
 */
export function descriptionsByName(
  names: Map<number, string> | undefined,
  infos: Map<number, string> | undefined,
): Map<string, string> {
  const found = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const [index, rawName] of names ?? []) {
    const name = rawName.trim();
    const description = cleanGameText(infos?.get(index) ?? '');
    if (!name || !description || description.includes('[VAR') || /^[?？]+$/.test(description)) {
      continue;
    }
    const previous = found.get(name);
    if (previous !== undefined && previous !== description) ambiguous.add(name);
    else found.set(name, description);
  }
  for (const name of ambiguous) found.delete(name);
  return found;
}

/** Game line breaks (`\n`, `\c` written as text) become spaces. */
export function cleanGameText(text: string): string {
  return text
    .replace(/\\[nrc]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function emptyDescriptions(): DescriptionsByName {
  return { moves: new Map(), abilities: new Map(), items: new Map() };
}

/** A file of a GitHub repository at a pinned commit, cached under tools/data-pipeline/.cache. */
async function cachedText(
  cache: string,
  repo: string,
  commit: string,
  path: string,
): Promise<string> {
  const cacheFile = join(CACHE_DIR, cache, commit, path);
  if (!existsSync(cacheFile)) {
    const url = rawGithubUrl(repo, commit, path);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${cache}: ${response.status} al descargar ${url}`);
    mkdirSync(dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, await response.text());
  }
  return readFileSync(cacheFile, 'utf8');
}
