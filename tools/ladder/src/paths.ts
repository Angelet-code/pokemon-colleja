import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReplayStore, StoredReplay } from './fetch';

/** Local, unversioned datasets (`datasets/` is git-ignored). Not `storage/`: that is user data. */
export const DATASETS = fileURLToPath(new URL('../../../datasets/ladder/', import.meta.url));

/** The doubles format, the only one with enough replays for now. */
export const LADDER_FORMAT = 'gen9championsvgc2026regmc';

export const replaysDir = (format: string) => join(DATASETS, format);

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
}
