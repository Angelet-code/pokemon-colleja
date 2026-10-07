/**
 * Saved teams (PLAN §3.7). `TeamRepository` hides where they live; `FileTeamRepository` keeps
 * one readable JSON file per team in `storage/teams/<id>.json`:
 *
 *   { "version": 1, "updatedAt": "…", "team": { …Team }, "export": "Garchomp @ Life Orb\n…" }
 *
 * `team` is the source of truth; `export` is a convenience copy in Showdown format (rewritten
 * on every save). Files that do not match the schema are skipped and reported to `onInvalid`.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatShowdownTeam, type Team } from '@colleja/core';
import { type TeamContent, TeamIdSchema, TeamSchema } from '@colleja/protocol';
import { z } from 'zod';

export interface StoredTeam {
  team: Team;
  /** ISO date of the last save. */
  updatedAt: string;
}

export interface TeamRepository {
  /** Every saved team, most recently updated first. */
  list(): Promise<StoredTeam[]>;
  get(id: string): Promise<StoredTeam | null>;
  /** Creates a team with a new id. */
  create(content: TeamContent): Promise<StoredTeam>;
  /** Replaces a team; `null` if it does not exist. */
  update(id: string, content: TeamContent): Promise<StoredTeam | null>;
  /** `false` if it did not exist. */
  delete(id: string): Promise<boolean>;
}

const FILE_VERSION = 1;

const TeamFileSchema = z.object({
  version: z.literal(FILE_VERSION),
  updatedAt: z.string(),
  team: TeamSchema,
  export: z.string().optional(),
});

export interface FileTeamRepositoryOptions {
  /** Called for files that cannot be read as a team (they are skipped). */
  onInvalid?: (file: string, reason: string) => void;
  /** Clock, for tests. */
  now?: () => Date;
}

export class FileTeamRepository implements TeamRepository {
  private readonly now: () => Date;

  constructor(
    readonly dir: string,
    private readonly options: FileTeamRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async list(): Promise<StoredTeam[]> {
    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const teams: StoredTeam[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const id = file.slice(0, -'.json'.length);
      const path = this.pathOf(id);
      if (!path) {
        this.options.onInvalid?.(join(this.dir, file), 'el nombre del fichero no es un id válido');
        continue;
      }
      const stored = await this.readFile(path, id);
      if (stored) teams.push(stored);
    }
    return teams.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<StoredTeam | null> {
    const path = this.pathOf(id);
    return path ? this.readFile(path, id) : null;
  }

  async create(content: TeamContent): Promise<StoredTeam> {
    return this.write({ ...content, id: randomUUID() });
  }

  async update(id: string, content: TeamContent): Promise<StoredTeam | null> {
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
  private async write(team: Team): Promise<StoredTeam> {
    const path = this.pathOf(team.id);
    if (!path) throw new Error(`Id de equipo no válido: "${team.id}".`);
    // Never write what `readFile` would later refuse (the team would silently disappear).
    TeamSchema.parse(team);
    const stored: StoredTeam = { team, updatedAt: this.now().toISOString() };
    const file = {
      version: FILE_VERSION,
      updatedAt: stored.updatedAt,
      team,
      export: formatShowdownTeam(team.members),
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
    return stored;
  }

  private async readFile(path: string, id: string): Promise<StoredTeam | null> {
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
    const result = TeamFileSchema.safeParse(data);
    if (!result.success) {
      const issue = result.error.issues[0];
      this.options.onInvalid?.(path, `${issue?.path.join('.') ?? ''}: ${issue?.message ?? ''}`);
      return null;
    }
    // The file name is the id: a copied file with a stale id inside must not clash.
    return { team: { ...result.data.team, id }, updatedAt: result.data.updatedAt };
  }

  /** `null` for ids that are not safe file names (the schema allows letters, digits, dashes). */
  private pathOf(id: string): string | null {
    return TeamIdSchema.safeParse(id).success ? join(this.dir, `${id}.json`) : null;
  }
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}
