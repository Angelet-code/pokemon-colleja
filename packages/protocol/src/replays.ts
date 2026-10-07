/**
 * Saved replays (`/api/replays`) and the bot's explanations. A replay is saved only when the
 * player asks for it, once the battle is over: it carries the omniscient log, the player's
 * own log (to watch it "as the player") and the bot's explanation of every turn.
 */
import type { ExplainedAction, TurnExplanation } from '@colleja/core';
import { z } from 'zod';
import { BattleOptionsSchema, BotLevelSchema, GameModeSchema, SideIdSchema } from './common';
import { PokemonSetSchema, SavedIdSchema } from './teams';

// ── Bot explanations ───────────────────────────────────────────────────────

const SpeciesSchema = z.string().max(40);

export const ExplainedActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('move'),
    user: SpeciesSchema,
    move: z.string().max(40),
    target: SpeciesSchema.optional(),
    targetSide: SideIdSchema.optional(),
    mega: z.boolean().optional(),
  }),
  z.object({ kind: z.literal('switch'), user: SpeciesSchema.optional(), species: SpeciesSchema }),
  z.object({ kind: z.literal('pass'), user: SpeciesSchema.optional() }),
  z.object({ kind: z.literal('hidden'), user: SpeciesSchema.optional() }),
]) satisfies z.ZodType<ExplainedAction>;

export const TurnExplanationSchema = z.object({
  turn: z.number().int().min(0),
  kind: z.enum(['moves', 'switch']),
  method: z.string().max(300),
  options: z
    .array(
      z.object({
        actions: z.array(ExplainedActionSchema).max(2),
        score: z.number(),
        chosen: z.boolean(),
      }),
    )
    .max(40),
}) satisfies z.ZodType<TurnExplanation>;

// ── Replays ────────────────────────────────────────────────────────────────

const PlayerSchema = z.object({ name: z.string(), team: z.array(PokemonSetSchema) });

/** `ReplayData` of `@colleja/engine` (version 1): everything needed to reproduce a battle. */
export const ReplayDataSchema = z.object({
  version: z.literal(1),
  mode: GameModeSchema,
  ruleset: z.literal('champions-regmc'),
  formatid: z.string(),
  options: BattleOptionsSchema,
  seed: z.string(),
  players: z.object({ p1: PlayerSchema, p2: PlayerSchema }),
  inputLog: z.array(z.string()),
  /** Omniscient protocol log. */
  log: z.array(z.string()),
  winner: SideIdSchema.nullable().optional(),
  turns: z.number().int().min(0),
});

/** How the rival was chosen (informative, for the list). */
export const ReplayOpponentKindSchema = z.enum(['random', 'team', 'saved']);

/** The stored content of a replay (everything but its id). */
export const ReplayContentSchema = z.object({
  /** Shown in the list ("Jugador contra Bot Táctico"). */
  name: z.string().trim().min(1).max(100),
  botLevel: BotLevelSchema,
  opponentKind: ReplayOpponentKindSchema,
  replay: ReplayDataSchema,
  /** The player's (p1) perspective of the log: what was seen during the battle. */
  playerLog: z.array(z.string()),
  /** The bot's explanation of each decision, unredacted (the battle is over). */
  explanations: z.array(TurnExplanationSchema),
});

export const SavedReplaySchema = ReplayContentSchema.extend({ id: SavedIdSchema });

export type ReplayDataValue = z.infer<typeof ReplayDataSchema>;
export type ReplayContent = z.infer<typeof ReplayContentSchema>;
export type SavedReplay = z.infer<typeof SavedReplaySchema>;

/** `GET /api/replays`: one entry per saved replay, most recent first. */
export interface ReplaySummary {
  id: string;
  name: string;
  mode: z.infer<typeof GameModeSchema>;
  players: { p1: string; p2: string };
  /** Teams as species, for the icons. */
  species: { p1: string[]; p2: string[] };
  winner: z.infer<typeof SideIdSchema> | null;
  turns: number;
  botLevel: z.infer<typeof BotLevelSchema>;
  opponentKind: z.infer<typeof ReplayOpponentKindSchema>;
  /** ISO date of the save. */
  updatedAt: string;
}

export interface ListReplaysResponse {
  replays: ReplaySummary[];
}

/** `GET /api/replays/:id`. */
export interface ReplayResponse {
  replay: SavedReplay;
  updatedAt: string;
}
