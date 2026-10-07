/** REST endpoints (`/api/*`): bodies are validated, responses typed. */
import type { PokemonSet } from '@colleja/core';
import { z } from 'zod';
import { type BotLevelSchema, GameModeSchema, SeedSchema, TeamTextSchema } from './common';

export const API_PREFIX = '/api';

/** `GET /api/meta`. */
export interface MetaResponse {
  regulation: string;
  showdown: { commit: string; date: string };
  botLevels: { level: z.infer<typeof BotLevelSchema>; name: string; description: string }[];
  defaultBotLevel: z.infer<typeof BotLevelSchema>;
}

/** `POST /api/teams/validate`. */
export const ValidateTeamRequestSchema = z.object({
  mode: GameModeSchema,
  team: TeamTextSchema,
});

export interface ValidateTeamResponse {
  valid: boolean;
  /** Spanish problems, from parsing and our checks; Showdown's validator messages are English. */
  problems: string[];
  /** Sets understood from the text (also when there are problems). */
  team: PokemonSet[];
}

/** `POST /api/teams/random`. */
export const RandomTeamRequestSchema = z.object({
  mode: GameModeSchema,
  seed: SeedSchema.optional(),
});

export interface RandomTeamResponse {
  seed: string;
  team: PokemonSet[];
  /** The same team in Showdown export format. */
  text: string;
}

/** Error body of any endpoint. */
export interface ApiError {
  error: string;
  details?: string[];
}

export type ValidateTeamRequest = z.infer<typeof ValidateTeamRequestSchema>;
export type RandomTeamRequest = z.infer<typeof RandomTeamRequestSchema>;
