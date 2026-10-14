/**
 * Where the metagame snapshots live: `storage/metagame/<id>.json`, one readable file each
 * (like the rest of `storage/`, not versioned):
 *
 *   { "version": 1, "updatedAt": "…", "snapshot": { …MetagameSnapshot } }
 *
 * The only writer of that folder (the CLI and the server both use it). The active snapshot is
 * the newest month (and, within a month, the highest cutoff).
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type MetagameSnapshot, MetagameSnapshotSchema } from '@colleja/protocol';

/** `$STORAGE_DIR/metagame` (default: the repository's `storage/`). */
export const METAGAME_DIR = join(
  process.env.STORAGE_DIR ?? fileURLToPath(new URL('../../../storage/', import.meta.url)),
  'metagame',
);

const FILE_VERSION = 1;

export class FileMetagameStore {
  constructor(private readonly dir: string = METAGAME_DIR) {}

  /** Ids of the stored snapshots, active (newest) first. */
  ids(): string[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((file) => /^[A-Za-z0-9-]+\.json$/.test(file))
      .map((file) => file.slice(0, -'.json'.length))
      .sort(compareIds);
  }

  get(id: string): MetagameSnapshot | null {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return null;
    const file = join(this.dir, `${id}.json`);
    if (!existsSync(file)) return null;
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as { snapshot?: unknown };
      const parsed = MetagameSnapshotSchema.safeParse(data.snapshot);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /** The newest snapshot that can be read, or `null`. */
  active(): MetagameSnapshot | null {
    for (const id of this.ids()) {
      const snapshot = this.get(id);
      if (snapshot) return snapshot;
    }
    return null;
  }

  /** Writes a snapshot (replacing the one of the same month and cutoff), atomically. */
  save(snapshot: MetagameSnapshot): void {
    const valid = MetagameSnapshotSchema.parse(snapshot);
    mkdirSync(this.dir, { recursive: true });
    const file = join(this.dir, `${valid.id}.json`);
    const temporary = `${file}.tmp`;
    const content = { version: FILE_VERSION, updatedAt: new Date().toISOString(), snapshot: valid };
    writeFileSync(temporary, `${JSON.stringify(content, null, 2)}\n`);
    renameSync(temporary, file);
  }
}

/** Newest month first; within a month, the highest cutoff first. */
function compareIds(a: string, b: string): number {
  const parse = (id: string) => {
    const match = /^(\d{4}-\d{2})-(\d+)$/.exec(id);
    return match ? { month: match[1] ?? '', cutoff: Number(match[2]) } : { month: '', cutoff: 0 };
  };
  const x = parse(a);
  const y = parse(b);
  return y.month.localeCompare(x.month) || y.cutoff - x.cutoff || a.localeCompare(b);
}
