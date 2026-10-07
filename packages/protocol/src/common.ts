/** Building blocks shared by the REST and WebSocket messages. */
import type { SlotAction } from '@colleja/core';
import { z } from 'zod';

/** Longest team text accepted (a full Showdown export of 6 Pokémon is ~1–2 KB). */
export const MAX_TEAM_TEXT = 20_000;

export const GameModeSchema = z.enum(['singles', 'doubles']);
export const SideIdSchema = z.enum(['p1', 'p2']);
export const LocaleSchema = z.enum(['es', 'en']);

/** Bot levels (same values as `BotLevel` in `@colleja/bot`; the server checks they match). */
export const BotLevelSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const BattleOptionsSchema = z.object({
  teamPreview: z.boolean(),
  openTeamSheets: z.boolean(),
});

/** A team as Showdown export text (what the user pastes). */
export const TeamTextSchema = z
  .string()
  .trim()
  .min(1, 'El equipo está vacío.')
  .max(MAX_TEAM_TEXT, 'El texto del equipo es demasiado largo.');

export const SeedSchema = z.string().trim().min(1).max(100);

const slot = z.number().int().min(1).max(6);

export const SlotActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('move'),
    move: z.number().int().min(1).max(4),
    target: z
      .number()
      .int()
      .min(-2)
      .max(2)
      .refine((target) => target !== 0, 'El objetivo 0 no existe.')
      .optional(),
    mega: z.boolean().optional(),
  }),
  z.object({ type: z.literal('switch'), slot }),
  z.object({ type: z.literal('pass') }),
]) satisfies z.ZodType<SlotAction>;

export const ChoiceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('team'), order: z.array(slot).min(1).max(6) }),
  z.object({ type: z.literal('actions'), actions: z.array(SlotActionSchema).min(1).max(2) }),
]);

export type GameModeValue = z.infer<typeof GameModeSchema>;
export type BotLevelValue = z.infer<typeof BotLevelSchema>;
