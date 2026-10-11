/**
 * The player's collection (`/api/collection`, «PC de Bill»): the species they own in the real
 * game, just to know it. One per user. The schema checks the shape; the server checks that
 * every species exists and can be picked in the teambuilder.
 */
import { z } from 'zod';
import { DataIdSchema, SavedIdSchema } from './teams';

/** More than the whole roster: only a guard against absurd bodies. */
export const COLLECTION_LIMITS = { species: 2000 } as const;

/** The editable content of the collection. */
export const CollectionContentSchema = z.object({
  species: z
    .array(DataIdSchema)
    .max(COLLECTION_LIMITS.species, 'Demasiados Pokémon.')
    .refine((species) => new Set(species).size === species.length, 'Hay especies repetidas.'),
});

export const CollectionSchema = CollectionContentSchema.extend({ id: SavedIdSchema });

export type CollectionContent = z.infer<typeof CollectionContentSchema>;
export type Collection = z.infer<typeof CollectionSchema>;

/** `PUT /api/collection`: replaces the whole collection. */
export const UpdateCollectionRequestSchema = z.object({ collection: CollectionContentSchema });

export type UpdateCollectionRequest = z.infer<typeof UpdateCollectionRequestSchema>;

/** `GET` and `PUT /api/collection`. */
export interface CollectionResponse {
  collection: CollectionContent;
  /** ISO date of the last save; `null` while nothing was saved yet. */
  updatedAt: string | null;
}
