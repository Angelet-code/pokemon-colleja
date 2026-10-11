/**
 * The player's collection («PC de Bill»): the species they own in the real game. There is only
 * one, saved as `storage/collection/pc.json` with the same storage as the teams
 * (`FileJsonRepository`):
 *
 *   { "version": 1, "updatedAt": "…", "collection": { "id": "pc", "species": […] }, "export": "…" }
 *
 * `export` lists the names in Spanish, one per line, to read the file by hand.
 */
import { getName } from '@colleja/data';
import { type Collection, type CollectionContent, CollectionSchema } from '@colleja/protocol';
import {
  FileJsonRepository,
  type JsonFileFormat,
  type JsonRepositoryOptions,
  type Stored,
} from '../storage/json-repository';

export type StoredCollection = Stored<'collection', Collection>;

export interface CollectionRepository {
  /** The saved collection, or `null` while nothing was saved yet. */
  load(): Promise<StoredCollection | null>;
  /** Replaces the whole collection. */
  save(content: CollectionContent): Promise<StoredCollection>;
}

/** Id (and file name) of the only collection. */
export const COLLECTION_ID = 'pc';

const COLLECTION_FILE: JsonFileFormat<'collection', Collection> = {
  key: 'collection',
  schema: CollectionSchema,
  version: 1,
  toExport: (collection) =>
    collection.species.map((species) => getName('species', species, 'es')).join('\n'),
};

export class FileCollectionRepository
  extends FileJsonRepository<'collection', Collection, CollectionContent>
  implements CollectionRepository
{
  constructor(dir: string, options: JsonRepositoryOptions = {}) {
    super(dir, COLLECTION_FILE, options);
  }

  load(): Promise<StoredCollection | null> {
    return this.get(COLLECTION_ID);
  }

  save(content: CollectionContent): Promise<StoredCollection> {
    return this.write({ ...content, id: COLLECTION_ID });
  }
}
