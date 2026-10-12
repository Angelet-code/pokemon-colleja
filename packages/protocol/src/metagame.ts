/**
 * The metagame (`/api/metagame`): read-only rivals built from the ladder (Smogon's monthly
 * usage stats for the sets, public replays for the teams of six), each with its **weight**
 * (how common its archetype is). A snapshot per month and rating cutoff; the active one is the
 * newest. `@colleja/metagame` builds and stores them (`storage/metagame/`); the server only
 * reads them, runs the update and copies a team to the saved opponents.
 */
import { z } from 'zod';
import { BotLevelSchema, GameModeSchema } from './common';
import { PokemonSetSchema, SavedIdSchema, type TeamSummary } from './teams';

export const MetagameSnapshotIdSchema = SavedIdSchema;
export const MetagameTeamIdSchema = z.string().regex(/^[a-z0-9-]{1,40}$/, 'Id no válido.');

/** `2026-09`. */
export const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes no válido.');

export const RATING_CUTOFFS = [0, 1500, 1630, 1760] as const;
export const DEFAULT_RATING_CUTOFF = 1760;

export const MetagameTeamSchema = z.object({
  /** Unique within its snapshot (`doubles-01`). */
  id: MetagameTeamIdSchema,
  name: z.string().min(1).max(100),
  mode: GameModeSchema,
  /** Spanish label of what it is built around (`Lluvia`, `Espacio Raro`…), or empty. */
  archetype: z.string().max(60),
  /** Share of its mode's metagame (the weights of a mode add up to 1). */
  weight: z.number().min(0).max(1),
  members: z.array(PokemonSetSchema).length(6),
});

/** Where the teams of a mode came from, to tell how representative they are. */
export const MetagameSourceSchema = z.object({
  mode: GameModeSchema,
  /** Showdown format of the stats and replays. */
  format: z.string(),
  /** Battles behind the usage stats of that month and cutoff. */
  battles: z.number().int().min(0),
  /**
   * - `replays`: archetypes of real teams of six seen in public replays (with their frequency).
   * - `teammates`: teams grown from the most used species and their usual partners (Smogon
   *   only gives partners in pairs), when there are not enough replays.
   */
  teamsFrom: z.enum(['replays', 'teammates']),
  /** Teams of six sampled from replays (0 with `teammates`). */
  samples: z.number().int().min(0),
  /** Share of the samples that the chosen archetypes cover (1 with `teammates`). */
  coverage: z.number().min(0).max(1),
  /** Teams that could not be made legal and were skipped. */
  discarded: z.number().int().min(0),
});

export const MetagameSnapshotSchema = z.object({
  /** `2026-09-1760`: also the file name. */
  id: MetagameSnapshotIdSchema,
  month: MonthSchema,
  cutoff: z.number().int().min(0),
  /** ISO date of the build. */
  createdAt: z.string(),
  sources: z.array(MetagameSourceSchema),
  teams: z.array(MetagameTeamSchema),
});

export type MetagameTeam = z.infer<typeof MetagameTeamSchema>;
export type MetagameSource = z.infer<typeof MetagameSourceSchema>;
export type MetagameSnapshot = z.infer<typeof MetagameSnapshotSchema>;

/** Id of the snapshot of a month and cutoff. */
export function metagameSnapshotId(month: string, cutoff: number): string {
  return `${month}-${cutoff}`;
}

// ── Bodies ─────────────────────────────────────────────────────────────────

/** `POST /api/metagame/update`: builds the snapshot of a month (default: the newest one). */
export const UpdateMetagameRequestSchema = z.object({
  month: MonthSchema.optional(),
  cutoff: z
    .number()
    .int()
    .refine((value) => (RATING_CUTOFFS as readonly number[]).includes(value), 'Corte no válido.')
    .optional(),
});

/** `POST /api/metagame/:snapshotId/teams/:teamId/copy`: to «Mis rivales», with this difficulty. */
export const CopyMetagameTeamRequestSchema = z.object({ botLevel: BotLevelSchema });

export type UpdateMetagameRequest = z.infer<typeof UpdateMetagameRequestSchema>;
export type CopyMetagameTeamRequest = z.infer<typeof CopyMetagameTeamRequestSchema>;

// ── Responses ──────────────────────────────────────────────────────────────

/** A metagame team in the lists: like a saved team, plus its weight and archetype. */
export interface MetagameTeamSummary extends TeamSummary {
  snapshotId: string;
  archetype: string;
  weight: number;
}

/** State of the update (one at a time). */
export interface MetagameUpdateStatus {
  running: boolean;
  /** Spanish, what it is doing now (or did last). */
  step: string | null;
  /** Spanish, why the last update failed. */
  error: string | null;
}

/** `GET /api/metagame`: the active snapshot and its teams. */
export interface MetagameResponse {
  snapshot: Omit<MetagameSnapshot, 'teams'> | null;
  teams: MetagameTeamSummary[];
  /** Ids of the older snapshots kept (for the bench history). */
  older: string[];
  update: MetagameUpdateStatus;
}

/** `GET /api/metagame/latest`: the newest month published by Smogon (checked at most daily). */
export interface LatestMetagameResponse {
  month: string | null;
  /** True when it is newer than the active snapshot. */
  newer: boolean;
  error: string | null;
}

/** `GET /api/metagame/:snapshotId/teams/:teamId`. */
export interface MetagameTeamResponse {
  snapshotId: string;
  team: MetagameTeam;
}
