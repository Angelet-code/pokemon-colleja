/**
 * Saved teams (PLAN §3.7), one readable JSON file per team in `storage/teams/<id>.json`:
 *
 *   { "version": 1, "updatedAt": "…", "team": { …Team }, "export": "Garchomp @ Life Orb\n…" }
 *
 * Storage details (atomic writes, safe ids, unreadable files) live in `FileJsonRepository`.
 */
import { formatShowdownTeam, type Team } from '@colleja/core';
import { type TeamContent, TeamSchema } from '@colleja/protocol';
import {
  FileJsonRepository,
  type JsonFileFormat,
  type JsonRepositoryOptions,
  type Repository,
  type Stored,
} from '../storage/json-repository';

export type StoredTeam = Stored<'team', Team>;
export type TeamRepository = Repository<'team', Team, TeamContent>;

const TEAM_FILE: JsonFileFormat<'team', Team> = {
  key: 'team',
  schema: TeamSchema,
  version: 1,
  toExport: (team) => formatShowdownTeam(team.members),
};

export class FileTeamRepository
  extends FileJsonRepository<'team', Team, TeamContent>
  implements TeamRepository
{
  constructor(dir: string, options: JsonRepositoryOptions = {}) {
    super(dir, TEAM_FILE, options);
  }
}
