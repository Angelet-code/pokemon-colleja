/**
 * Saved opponents (`/api/opponents`): a team for the bot plus its difficulty. The team part is
 * exactly a saved team (`TeamContentSchema`), so the same editor builds both; like teams, an
 * opponent may be an illegal draft (the responses carry its `problems`).
 *
 * Only the difficulty is stored: the practice options (team preview, open team sheets) belong
 * to each battle, not to the opponent.
 */
import { z } from 'zod';
import { BotLevelSchema } from './common';
import {
  ImportTeamRequestSchema,
  SavedIdSchema,
  TeamContentSchema,
  type TeamSummary,
} from './teams';

export const OpponentIdSchema = SavedIdSchema;

/** The editable content of an opponent (everything but its id). */
export const OpponentContentSchema = TeamContentSchema.extend({
  /** Difficulty applied when the opponent is picked (it can still be changed per battle). */
  botLevel: BotLevelSchema,
});

export const SavedOpponentSchema = OpponentContentSchema.extend({ id: OpponentIdSchema });

export type OpponentContent = z.infer<typeof OpponentContentSchema>;
export type SavedOpponent = z.infer<typeof SavedOpponentSchema>;

// ── Bodies ─────────────────────────────────────────────────────────────────

/** `POST /api/opponents`: an opponent built in the editor. */
export const CreateOpponentRequestSchema = z.object({ opponent: OpponentContentSchema });

/** `POST /api/opponents/import`: an opponent pasted as Showdown export text. */
export const ImportOpponentRequestSchema = ImportTeamRequestSchema.extend({
  botLevel: BotLevelSchema,
});

/** `PUT /api/opponents/:id`. */
export const UpdateOpponentRequestSchema = z.object({ opponent: OpponentContentSchema });

export type CreateOpponentRequest = z.infer<typeof CreateOpponentRequestSchema>;
export type ImportOpponentRequest = z.infer<typeof ImportOpponentRequestSchema>;
export type UpdateOpponentRequest = z.infer<typeof UpdateOpponentRequestSchema>;

// ── Responses ──────────────────────────────────────────────────────────────

/** `GET /api/opponents`: like a team summary, plus the difficulty. */
export interface OpponentSummary extends TeamSummary {
  botLevel: z.infer<typeof BotLevelSchema>;
}

export interface ListOpponentsResponse {
  opponents: OpponentSummary[];
}

/** `GET`, `POST` and `PUT` of one opponent (same fields as `TeamResponse`). */
export interface OpponentResponse {
  opponent: SavedOpponent;
  problems: string[];
  adjustments: string[];
  updatedAt: string;
}
