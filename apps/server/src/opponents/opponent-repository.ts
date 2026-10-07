/**
 * Saved opponents (PLAN §3.7): a team for the bot plus its difficulty, one readable JSON file
 * each in `storage/opponents/<id>.json`:
 *
 *   { "version": 1, "updatedAt": "…", "opponent": { …SavedOpponent }, "export": "…" }
 *
 * Same storage as the teams (`FileJsonRepository`).
 */
import { formatShowdownTeam } from '@colleja/core';
import { type OpponentContent, type SavedOpponent, SavedOpponentSchema } from '@colleja/protocol';
import {
  FileJsonRepository,
  type JsonFileFormat,
  type JsonRepositoryOptions,
  type Repository,
  type Stored,
} from '../storage/json-repository';

export type StoredOpponent = Stored<'opponent', SavedOpponent>;
export type OpponentRepository = Repository<'opponent', SavedOpponent, OpponentContent>;

const OPPONENT_FILE: JsonFileFormat<'opponent', SavedOpponent> = {
  key: 'opponent',
  schema: SavedOpponentSchema,
  version: 1,
  toExport: (opponent) => formatShowdownTeam(opponent.members),
};

export class FileOpponentRepository
  extends FileJsonRepository<'opponent', SavedOpponent, OpponentContent>
  implements OpponentRepository
{
  constructor(dir: string, options: JsonRepositoryOptions = {}) {
    super(dir, OPPONENT_FILE, options);
  }
}
