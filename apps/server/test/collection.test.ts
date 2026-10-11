import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ApiError, CollectionResponse } from '@colleja/protocol';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileCollectionRepository } from '../src/collection/collection-repository';
import { tempCollectionDir, testServer } from './helpers';

describe('FileCollectionRepository', () => {
  it('keeps a single collection in pc.json with the names as export', async () => {
    const dir = tempCollectionDir();
    const repository = new FileCollectionRepository(dir);
    expect(await repository.load()).toBeNull();

    await repository.save({ species: ['gyarados', 'golurk'] });
    const { collection } = await repository.save({ species: ['golurk'] });
    expect(collection).toEqual({ id: 'pc', species: ['golurk'] });

    expect(readdirSync(dir)).toEqual(['pc.json']);
    const file = JSON.parse(readFileSync(join(dir, 'pc.json'), 'utf8'));
    expect(file).toMatchObject({ version: 1, collection: { species: ['golurk'] } });
    expect(file.export).toBe('Golurk');
    expect((await repository.load())?.collection.species).toEqual(['golurk']);
  });
});

describe('/api/collection', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await testServer();
  });

  afterEach(async () => {
    await app.close();
  });

  it('starts empty, saves in National Dex order and reads it back', async () => {
    const empty = await app.inject({ method: 'GET', url: '/api/collection' });
    expect(empty.json<CollectionResponse>()).toEqual({
      collection: { species: [] },
      updatedAt: null,
    });

    const saved = await app.inject({
      method: 'PUT',
      url: '/api/collection',
      payload: { collection: { species: ['golurk', 'gyarados', 'stunfiskgalar', 'stunfisk'] } },
    });
    expect(saved.statusCode).toBe(200);
    const body = saved.json<CollectionResponse>();
    expect(body.collection.species).toEqual(['gyarados', 'stunfisk', 'stunfiskgalar', 'golurk']);
    expect(body.updatedAt).toEqual(expect.any(String));

    const read = await app.inject({ method: 'GET', url: '/api/collection' });
    expect(read.json<CollectionResponse>()).toEqual(body);
  });

  it('rejects unknown species, Mega forms and repeated species', async () => {
    const unknown = await app.inject({
      method: 'PUT',
      url: '/api/collection',
      payload: { collection: { species: ['gyarados', 'missingno', 'gyaradosmega'] } },
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json<ApiError>().details).toEqual(['missingno', 'gyaradosmega']);

    const repeated = await app.inject({
      method: 'PUT',
      url: '/api/collection',
      payload: { collection: { species: ['gyarados', 'gyarados'] } },
    });
    expect(repeated.statusCode).toBe(400);

    const read = await app.inject({ method: 'GET', url: '/api/collection' });
    expect(read.json<CollectionResponse>().collection.species).toEqual([]);
  });
});
