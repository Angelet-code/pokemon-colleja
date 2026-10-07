/**
 * WebSocket messages of a battle (PLAN §3.6). One socket can host one battle at a time.
 *
 * - Client → server messages are validated strictly: they come from the browser.
 * - Server → client messages carry `core` structures (requests, sets) that the engine already
 *   produced; their schemas check the envelope and type the payload.
 *
 * Hidden information: the server only ever sends the player's (p1) perspective.
 */
import type { BattleRequest, PokemonSet, SideId } from '@colleja/core';
import { z } from 'zod';
import {
  BattleOptionsSchema,
  BotLevelSchema,
  ChoiceSchema,
  GameModeSchema,
  SeedSchema,
  SideIdSchema,
  TeamTextSchema,
} from './common';
import { OpponentIdSchema } from './opponents';
import { TurnExplanationSchema } from './replays';
import { TeamIdSchema } from './teams';

/** WebSocket endpoint path. */
export const BATTLE_SOCKET_PATH = '/ws';

const BattleIdSchema = z.string().min(1).max(64);

// ── Client → server ────────────────────────────────────────────────────────

export const OpponentSchema = z.discriminatedUnion('kind', [
  /** Random legal team generated from the standard sets. */
  z.object({ kind: z.literal('random') }),
  /** A team pasted in Showdown export format. */
  z.object({ kind: z.literal('team'), team: TeamTextSchema }),
  /** A saved opponent (`/api/opponents`). Its difficulty is applied by the client in `botLevel`. */
  z.object({ kind: z.literal('saved'), opponentId: OpponentIdSchema }),
]);

export const StartBattleSchema = z
  .object({
    type: z.literal('battle:start'),
    mode: GameModeSchema,
    /** The player's team as Showdown export text… */
    team: TeamTextSchema.optional(),
    /** …or the id of a saved team (exactly one of the two). */
    teamId: TeamIdSchema.optional(),
    opponent: OpponentSchema,
    botLevel: BotLevelSchema,
    options: BattleOptionsSchema,
    seed: SeedSchema.optional(),
    playerName: z.string().trim().min(1).max(18).optional(),
  })
  .refine((message) => (message.team === undefined) !== (message.teamId === undefined), {
    message: 'Indica tu equipo: el texto o un equipo guardado (uno de los dos).',
    path: ['team'],
  });

export const ClientMessageSchema = z.discriminatedUnion('type', [
  StartBattleSchema,
  z.object({ type: z.literal('battle:choose'), battleId: BattleIdSchema, choice: ChoiceSchema }),
  z.object({ type: z.literal('battle:undo'), battleId: BattleIdSchema }),
  z.object({
    type: z.literal('battle:rewind'),
    battleId: BattleIdSchema,
    turn: z.number().int().min(0),
  }),
  z.object({ type: z.literal('battle:forfeit'), battleId: BattleIdSchema }),
  z.object({ type: z.literal('battle:export'), battleId: BattleIdSchema }),
  /** Saves the finished battle in the replay list (`/api/replays`). */
  z.object({ type: z.literal('battle:save-replay'), battleId: BattleIdSchema }),
  /** Reattach to a battle after a reconnection (while the server keeps it). */
  z.object({ type: z.literal('battle:resume'), battleId: BattleIdSchema }),
]);

export type StartBattleMessage = z.infer<typeof StartBattleSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ── Server → client ────────────────────────────────────────────────────────

const RequestSchema = z.custom<BattleRequest>(
  (value) => typeof value === 'object' && value !== null && 'side' in value,
);
const SetsSchema = z.custom<PokemonSet[]>((value) => Array.isArray(value));
const WinnerSchema = z.custom<SideId | null>(
  (value) => value === null || SideIdSchema.safeParse(value).success,
);

/** Where the battle stands: what the controls need besides the request. */
export const BattleStatusSchema = z.object({
  turn: z.number().int().min(0),
  /** Turns the battle can be rewound to (0 = team preview). */
  rewindableTurns: z.array(z.number().int().min(0)),
  /** Turn `undo` would go back to, or `null` when there is nothing to undo. */
  undoTarget: z.number().int().min(0).nullable(),
  ended: z.boolean(),
  /** Only meaningful when `ended`: `null` is a tie. */
  winner: WinnerSchema,
});

export const BattleErrorKindSchema = z.enum([
  /** The message itself is malformed. */
  'message',
  /** A team is not legal (problems in `details`). */
  'team',
  /** The choice was rejected; the battle keeps waiting for a valid one. */
  'choice',
  /** The battle does not exist (anymore) or is not attached to this socket. */
  'not-found',
  /** The action is not possible right now (e.g. exporting an unfinished battle). */
  'state',
  'internal',
]);

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('battle:started'),
    battleId: BattleIdSchema,
    mode: GameModeSchema,
    seed: z.string(),
    botLevel: BotLevelSchema,
    options: BattleOptionsSchema,
    players: z.object({ p1: z.string(), p2: z.string() }),
    /** The player's own sets, as built. */
    team: SetsSchema,
    /** The rival's sets: only with Open Team Sheets. */
    opponentTeam: SetsSchema.nullable(),
  }),
  /** New protocol lines (p1 perspective) and the current request after an action. */
  z.object({
    type: z.literal('battle:update'),
    battleId: BattleIdSchema,
    lines: z.array(z.string()),
    request: RequestSchema.nullable(),
    status: BattleStatusSchema,
    /**
     * The bot's explanations of decisions that are now resolved (new since the last message),
     * with what the player has not seen yet hidden.
     */
    explanations: z.array(TurnExplanationSchema).optional(),
  }),
  /** Full state, after a rewind, an undo or a reconnection: the client starts over from it. */
  z.object({
    type: z.literal('battle:snapshot'),
    battleId: BattleIdSchema,
    log: z.array(z.string()),
    request: RequestSchema.nullable(),
    status: BattleStatusSchema,
    /** Every resolved explanation of the bot so far (redacted like in `battle:update`). */
    explanations: z.array(TurnExplanationSchema).optional(),
  }),
  /** Replay JSON of a finished battle (`ReplayData` of `@colleja/engine`). */
  z.object({
    type: z.literal('battle:replay'),
    battleId: BattleIdSchema,
    replay: z.record(z.string(), z.unknown()),
  }),
  /** The replay was saved (`battle:save-replay`). */
  z.object({
    type: z.literal('battle:replay-saved'),
    battleId: BattleIdSchema,
    replayId: z.string(),
  }),
  z.object({
    type: z.literal('battle:error'),
    battleId: BattleIdSchema.optional(),
    kind: BattleErrorKindSchema,
    /** Spanish, for the user. */
    message: z.string(),
    details: z.array(z.string()).optional(),
  }),
]);

export type BattleStatus = z.infer<typeof BattleStatusSchema>;
export type BattleErrorKind = z.infer<typeof BattleErrorKindSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type ServerMessageOf<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;
