/**
 * Saved benches (PLAN §3.7): the history of each team, one JSON file per finished (or
 * cancelled) bench in `storage/bench/<id>.json`:
 *
 *   { "version": 1, "updatedAt": "…", "bench": { …SavedBench } }
 *
 * Same storage as teams, opponents and replays. Created only by the server (`BenchManager`).
 */
import { type BenchContent, type SavedBench, SavedBenchSchema } from '@colleja/protocol';
import {
  FileJsonRepository,
  type JsonFileFormat,
  type JsonRepositoryOptions,
  type Repository,
  type Stored,
} from '../storage/json-repository';

export type StoredBench = Stored<'bench', SavedBench>;

/** Benches keep the id they ran with (the one the client followed), so they are saved with it. */
export interface BenchRepository extends Repository<'bench', SavedBench, BenchContent> {
  save(id: string, content: BenchContent): Promise<StoredBench>;
}

const BENCH_FILE: JsonFileFormat<'bench', SavedBench> = {
  key: 'bench',
  schema: SavedBenchSchema,
  version: 1,
};

export class FileBenchRepository
  extends FileJsonRepository<'bench', SavedBench, BenchContent>
  implements BenchRepository
{
  constructor(dir: string, options: JsonRepositoryOptions = {}) {
    super(dir, BENCH_FILE, options);
  }

  save(id: string, content: BenchContent): Promise<StoredBench> {
    return this.write({ ...content, id });
  }
}
