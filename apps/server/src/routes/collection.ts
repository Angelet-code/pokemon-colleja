/**
 * The player's collection («PC de Bill»): the species they own in the real game.
 *
 *   GET /api/collection   the collection (empty until the first save)
 *   PUT /api/collection   replaces it
 *
 * Only species that can be picked in the teambuilder are accepted; the response keeps them in
 * National Dex order.
 */
import { getSpecies, type SpeciesId } from '@colleja/data';
import {
  API_PREFIX,
  type ApiError,
  type CollectionContent,
  type CollectionResponse,
  UpdateCollectionRequestSchema,
} from '@colleja/protocol';
import type { FastifyInstance } from 'fastify';
import type { CollectionRepository } from '../collection/collection-repository';
import { parseBody } from './parse-body';

const COLLECTION = `${API_PREFIX}/collection`;

export function registerCollectionRoutes(
  app: FastifyInstance,
  collection: CollectionRepository,
): void {
  app.get(COLLECTION, async (): Promise<CollectionResponse> => {
    const stored = await collection.load();
    return stored
      ? { collection: { species: stored.collection.species }, updatedAt: stored.updatedAt }
      : { collection: { species: [] }, updatedAt: null };
  });

  app.put(COLLECTION, async (request, reply) => {
    const body = parseBody(UpdateCollectionRequestSchema, request.body, reply);
    if (!body) return reply;
    const unknown = body.collection.species.filter(
      (species) => getSpecies(species as SpeciesId)?.kind !== 'standard',
    );
    if (unknown.length > 0) {
      const error: ApiError = {
        error: 'Hay especies que no existen en Champions.',
        details: unknown,
      };
      return reply.code(400).send(error);
    }
    const stored = await collection.save(sorted(body.collection));
    const response: CollectionResponse = {
      collection: { species: stored.collection.species },
      updatedAt: stored.updatedAt,
    };
    return response;
  });
}

/** National Dex order, then id (forms of the same species). */
function sorted({ species }: CollectionContent): CollectionContent {
  const num = (id: string) => getSpecies(id as SpeciesId)?.num ?? 0;
  return { species: [...species].sort((a, b) => num(a) - num(b) || a.localeCompare(b)) };
}
