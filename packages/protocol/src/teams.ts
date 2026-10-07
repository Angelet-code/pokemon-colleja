/**
 * Saved teams (`/api/teams`): the `Team` of core as a schema, plus the CRUD bodies and
 * responses. The schemas check shape and structural limits (6 members, 4 moves, 0–32 Stat
 * Points per stat); legality is decided by `checkTeam` and Showdown's validator, so a saved
 * team may be an illegal draft (the responses carry its `problems`).
 */
import type { PokemonSet, Team } from '@colleja/core';
import { z } from 'zod';
import { GameModeSchema, TeamTextSchema } from './common';

/** Structural limits (the format data has the same numbers; `checkTeam` checks the totals). */
export const TEAM_LIMITS = {
  members: 6,
  moves: 4,
  statPointsPerStat: 32,
  nickname: 18,
  name: 60,
  notes: 2000,
} as const;

/** Ids of saved things are used as file names: only letters, digits and dashes (UUIDs). */
export const SavedIdSchema = z.string().regex(/^[A-Za-z0-9-]{1,64}$/, 'Id no válido.');

export const TeamIdSchema = SavedIdSchema;

/** Showdown-style id (`garchomp`, `lifeorb`): lowercase letters and digits. */
const DataIdSchema = z.string().regex(/^[a-z0-9]{1,40}$/, 'Id no válido.');

const statPoint = z.number().int().min(0).max(TEAM_LIMITS.statPointsPerStat);

export const StatTableSchema = z.object({
  hp: statPoint,
  atk: statPoint,
  def: statPoint,
  spa: statPoint,
  spd: statPoint,
  spe: statPoint,
});

export const PokemonSetSchema = z.object({
  species: DataIdSchema,
  nickname: z.string().trim().min(1).max(TEAM_LIMITS.nickname).optional(),
  item: DataIdSchema.optional(),
  ability: DataIdSchema,
  nature: DataIdSchema,
  statPoints: StatTableSchema,
  moves: z.array(DataIdSchema).max(TEAM_LIMITS.moves, 'Más de 4 movimientos.'),
  gender: z.enum(['M', 'F']).optional(),
  shiny: z.boolean().optional(),
}) satisfies z.ZodType<PokemonSet>;

export const TeamNameSchema = z
  .string()
  .trim()
  .min(1, 'El equipo necesita un nombre.')
  .max(TEAM_LIMITS.name, 'El nombre es demasiado largo.');

/** The editable content of a team (everything but its id). */
export const TeamContentSchema = z.object({
  name: TeamNameSchema,
  /** Preferred mode: the team can be used in both if it is legal. */
  mode: GameModeSchema,
  ruleset: z.literal('champions-regmc'),
  members: z.array(PokemonSetSchema).max(TEAM_LIMITS.members, 'Más de 6 Pokémon.'),
  notes: z.string().max(TEAM_LIMITS.notes).optional(),
});

export const TeamSchema = TeamContentSchema.extend({ id: TeamIdSchema }) satisfies z.ZodType<Team>;

export type TeamContent = z.infer<typeof TeamContentSchema>;

// ── Bodies ─────────────────────────────────────────────────────────────────

/** `POST /api/teams`: a team built in the editor. */
export const CreateTeamRequestSchema = z.object({ team: TeamContentSchema });

/** `POST /api/teams/import`: a team pasted as Showdown export text. */
export const ImportTeamRequestSchema = z.object({
  text: TeamTextSchema,
  name: TeamNameSchema,
  mode: GameModeSchema,
});

/** `PUT /api/teams/:id`. */
export const UpdateTeamRequestSchema = z.object({ team: TeamContentSchema });

export type CreateTeamRequest = z.infer<typeof CreateTeamRequestSchema>;
export type ImportTeamRequest = z.infer<typeof ImportTeamRequestSchema>;
export type UpdateTeamRequest = z.infer<typeof UpdateTeamRequestSchema>;

// ── Responses ──────────────────────────────────────────────────────────────

/** `GET /api/teams`: one entry per saved team, most recently updated first. */
export interface TeamSummary {
  id: string;
  name: string;
  mode: z.infer<typeof GameModeSchema>;
  species: string[];
  /** Same as `problems.length === 0`, kept for readability. */
  valid: boolean;
  problems: string[];
  /** ISO date. */
  updatedAt: string;
}

export interface ListTeamsResponse {
  teams: TeamSummary[];
}

/** `GET`, `POST` and `PUT` of one team. */
export interface TeamResponse {
  team: Team;
  /** Spanish problems from `checkTeam`, then Showdown's validator (English, prefixed). */
  problems: string[];
  /**
   * Import only: lines that could not be read and changes made to fit the editor's
   * limits (Spanish). Empty otherwise.
   */
  adjustments: string[];
  updatedAt: string;
}
