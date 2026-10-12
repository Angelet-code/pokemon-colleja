/**
 * Public replays on disk (`datasets/ladder/<format>/<id>.json`, not versioned) and the teams of
 * six they show at team preview. Shared by `tools/ladder` (positions, learned value) and the
 * metagame update (archetypes of real teams).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSpecies, toId } from '@colleja/data';
import type { ReplayStore, StoredReplay } from './replay-fetch';

/** Local datasets (`datasets/`, git-ignored). Not `storage/`: that is user data. */
export const DATASETS_DIR =
  process.env.DATASETS_DIR ?? fileURLToPath(new URL('../../../datasets/', import.meta.url));

/** Folder of the replays of a format inside a datasets folder. */
export function ladderReplaysDir(format: string, datasets = DATASETS_DIR): string {
  return join(datasets, 'ladder', format);
}

/** A folder of `<id>.json` replays plus `.cursor` with the oldest search time reached. */
export class FolderReplayStore implements ReplayStore {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  has(id: string): boolean {
    return existsSync(join(this.dir, `${id}.json`));
  }

  save(replay: StoredReplay): void {
    writeFileSync(join(this.dir, `${replay.id}.json`), JSON.stringify(replay));
  }

  readCursor(): number | undefined {
    const file = join(this.dir, '.cursor');
    if (!existsSync(file)) return undefined;
    const value = Number(readFileSync(file, 'utf8').trim());
    return Number.isFinite(value) ? value : undefined;
  }

  writeCursor(before: number): void {
    writeFileSync(join(this.dir, '.cursor'), `${before}\n`);
  }

  /** Every stored replay (in file name order, so the same folder gives the same list). */
  *replays(): Generator<StoredReplay> {
    if (!existsSync(this.dir)) return;
    const files = readdirSync(this.dir)
      .filter((file) => file.endsWith('.json'))
      .sort();
    for (const file of files) {
      try {
        yield JSON.parse(readFileSync(join(this.dir, file), 'utf8')) as StoredReplay;
      } catch {
        // A half-written file (an interrupted download): skip it.
      }
    }
  }
}

/** A team of six seen at team preview, with the rating of its battle and when it was played. */
export interface PreviewTeam {
  /** Species ids (base formes: a Mega Evolution is not shown at team preview). */
  species: string[];
  rating: number;
  uploadtime: number;
}

/**
 * Species id of a team preview name (`Floette-Eternal`, `Vivillon-Pokeball`, `Urshifu-*`):
 * the forme when it exists in the data, otherwise its base (cosmetic formes). `null` if the
 * species is unknown.
 */
export function previewSpecies(name: string): string | null {
  let current = name.replace(/-\*$/, '');
  for (;;) {
    const id = toId(current);
    const species = getSpecies(id);
    if (species) return species.kind === 'standard' ? id : (species.changesFrom ?? id);
    const dash = current.lastIndexOf('-');
    if (dash <= 0) return null;
    current = current.slice(0, dash);
  }
}

/** Both teams of a replay's team preview (`|poke|p1|Garchomp, L50, F|`). Only full teams. */
export function previewTeams(replay: StoredReplay): PreviewTeam[] {
  const sides: Record<string, string[]> = { p1: [], p2: [] };
  for (const line of replay.log.split('\n')) {
    if (line.startsWith('|turn|')) break;
    if (!line.startsWith('|poke|')) continue;
    const [, , side, details] = line.split('|');
    const name = details?.split(',')[0]?.trim();
    const list = side ? sides[side] : undefined;
    if (!list || !name) continue;
    const species = previewSpecies(name);
    if (species) list.push(species);
    else list.push('');
  }
  return Object.values(sides)
    .filter((species) => species.length === 6 && species.every((id) => id !== ''))
    .map((species) => ({ species, rating: replay.rating, uploadtime: replay.uploadtime }));
}
