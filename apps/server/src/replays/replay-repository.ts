/**
 * Saved replays (PLAN §3.7), one JSON file each in `storage/replays/<id>.json`:
 *
 *   { "version": 1, "updatedAt": "…", "replay": { …SavedReplay } }
 *
 * Saved only when the player asks for it. Same storage as teams and opponents.
 */
import { type ReplayContent, type SavedReplay, SavedReplaySchema } from '@colleja/protocol';
import {
  FileJsonRepository,
  type JsonFileFormat,
  type JsonRepositoryOptions,
  type Repository,
  type Stored,
} from '../storage/json-repository';

export type StoredReplay = Stored<'replay', SavedReplay>;
export type ReplayRepository = Repository<'replay', SavedReplay, ReplayContent>;

const REPLAY_FILE: JsonFileFormat<'replay', SavedReplay> = {
  key: 'replay',
  schema: SavedReplaySchema,
  version: 1,
};

export class FileReplayRepository
  extends FileJsonRepository<'replay', SavedReplay, ReplayContent>
  implements ReplayRepository
{
  constructor(dir: string, options: JsonRepositoryOptions = {}) {
    super(dir, REPLAY_FILE, options);
  }
}
