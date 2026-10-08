/**
 * Generic storage of saved things (PLAN §3.7): one readable JSON file per item in a folder,
 *
 *   { "version": 1, "updatedAt": "…", "<key>": { …item }, "export": "Garchomp @ Life Orb\n…" }
 *
 * `<key>` (`team`, `opponent`…) holds the source of truth; `export` is an optional
 * convenience copy (Showdown text) rewritten on every save. Writes are atomic (temporary file
 * plus rename) and the file name is the id, so only safe ids (`SavedIdSchema`) are accepted.
 * Files that do not match the schema are skipped and reported to `onInvalid`.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SavedIdSchema } from '@colleja/protocol';
import { z } from 'zod';

/** A saved item under its key (`{ team, updatedAt }`), plus the date of the last save. */
export type Stored<K extends string, T> = { [P in K]: T } & {
  /** ISO date of the last save. */
  updatedAt: string;
};

export interface Repository<K extends string, T extends { id: string }, C> {
  /** Every saved item, most recently updated first. */
  list(): Promise<Stored<K, T>[]>;
  get(id: string): Promise<Stored<K, T> | null>;
  /** Creates an item with a new id. */
  create(content: C): Promise<Stored<K, T>>;
  /** Replaces an item; `null` if it does not exist. */
  update(id: string, content: C): Promise<Stored<K, T> | null>;
  /** `false` if it did not exist. */
  delete(id: string): Promise<boolean>;
}

/** What is stored and how its files look. */
export interface JsonFileFormat<K extends string, T> {
  /** Property of the file that holds the item. */
  key: K;
  /** Checked on every read and before every write. */
  schema: z.ZodType<T>;
  /** File format version. When it changes, keep reading the previous one. */
  version: number;
  /** Convenience text copy saved next to the item (e.g. its Showdown export). */
  toExport?: (item: T) => string;
}

export interface JsonRepositoryOptions {
  /** Called for files that cannot be read (they are skipped). */
  onInvalid?: (file: string, reason: string) => void;
  /** Clock, for tests. */
  now?: () => Date;
}

export class FileJsonRepository<K extends string, T extends { id: string }, C extends object>
  implements Repository<K, T, C>
{
  private readonly now: () => Date;
  private readonly envelope;

  constructor(
    readonly dir: string,
    private readonly format: JsonFileFormat<K, T>,
    private readonly options: JsonRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.envelope = z.looseObject({
      version: z.literal(format.version),
      updatedAt: z.string(),
      export: z.string().optional(),
    });
  }

  async list(): Promise<Stored<K, T>[]> {
    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const items: Stored<K, T>[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const id = file.slice(0, -'.json'.length);
      const path = this.pathOf(id);
      if (!path) {
        this.options.onInvalid?.(join(this.dir, file), 'el nombre del fichero no es un id válido');
        continue;
      }
      const stored = await this.readFile(path, id);
      if (stored) items.push(stored);
    }
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Stored<K, T> | null> {
    const path = this.pathOf(id);
    return path ? this.readFile(path, id) : null;
  }

  async create(content: C): Promise<Stored<K, T>> {
    return this.write({ ...content, id: randomUUID() });
  }

  async update(id: string, content: C): Promise<Stored<K, T> | null> {
    if (!(await this.get(id))) return null;
    return this.write({ ...content, id });
  }

  async delete(id: string): Promise<boolean> {
    const path = this.pathOf(id);
    if (!path) return false;
    try {
      await rm(path);
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  /** Atomic write: a temporary file in the same folder, then a rename over the old one. */
  protected async write(candidate: C & { id: string }): Promise<Stored<K, T>> {
    const path = this.pathOf(candidate.id);
    if (!path) throw new Error(`Id no válido: "${candidate.id}".`);
    // Never write what `readFile` would later refuse (the item would silently disappear).
    const item = this.format.schema.parse(candidate);
    const updatedAt = this.now().toISOString();
    const file = {
      version: this.format.version,
      updatedAt,
      [this.format.key]: item,
      ...(this.format.toExport ? { export: this.format.toExport(item) } : {}),
    };
    await mkdir(this.dir, { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    return this.stored(item, updatedAt);
  }

  private async readFile(path: string, id: string): Promise<Stored<K, T> | null> {
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      this.options.onInvalid?.(path, 'no es JSON válido');
      return null;
    }
    const envelope = this.envelope.safeParse(data);
    if (!envelope.success) {
      this.options.onInvalid?.(path, describeIssue(envelope.error));
      return null;
    }
    const item = this.format.schema.safeParse(envelope.data[this.format.key]);
    if (!item.success) {
      this.options.onInvalid?.(path, describeIssue(item.error, this.format.key));
      return null;
    }
    // The file name is the id: a copied file with a stale id inside must not clash.
    return this.stored({ ...item.data, id }, envelope.data.updatedAt);
  }

  private stored(item: T, updatedAt: string): Stored<K, T> {
    return { [this.format.key]: item, updatedAt } as Stored<K, T>;
  }

  /** `null` for ids that are not safe file names (letters, digits and dashes). */
  private pathOf(id: string): string | null {
    return SavedIdSchema.safeParse(id).success ? join(this.dir, `${id}.json`) : null;
  }
}

function describeIssue(error: z.ZodError, prefix?: string): string {
  const issue = error.issues[0];
  const path = [...(prefix ? [prefix] : []), ...(issue?.path ?? [])].join('.');
  return `${path}: ${issue?.message ?? ''}`;
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}
