/**
 * The team bench (`/api/bench` and the `/ws/bench` WebSocket): your saved team (and optionally
 * a second version of it) against your saved rivals, bot against bot, with its win rate per
 * rival and in total. `BenchSummarySchema` replicates `BenchSummary` of `@colleja/bench`
 * (Node-only): if one changes, change the other (the server stops compiling otherwise).
 */
import { z } from 'zod';
import { BotLevelSchema, GameModeSchema, SeedSchema, SideIdSchema, TeamTextSchema } from './common';
import { OpponentIdSchema } from './opponents';
import { PokemonSetSchema, SavedIdSchema, TeamIdSchema, TeamNameSchema } from './teams';

/** WebSocket endpoint of the bench progress. */
export const BENCH_SOCKET_PATH = '/ws/bench';

export const BenchIdSchema = SavedIdSchema;

/** Most rivals and battles a bench accepts (a whole bench with level 3 takes minutes). */
export const BENCH_LIMITS = {
  opponents: 60,
  fixedBattles: 200,
  minPerStratum: 50,
  maxBattles: 5000,
} as const;

// ── Request ────────────────────────────────────────────────────────────────

export const BenchBudgetSchema = z.discriminatedUnion('kind', [
  /** `battles` per rival and mode (per version). */
  z.object({
    kind: z.literal('fixed'),
    battles: z.number().int().min(1).max(BENCH_LIMITS.fixedBattles),
  }),
  /**
   * Stops when the 95 % interval of the total (or of the A/B difference) is within ± `margin`
   * (a fraction: 0.05 = 5 points), or the difference is clearly not 0, or at `maxBattles` per
   * version. At least `minPerStratum` per rival and mode.
   */
  z.object({
    kind: z.literal('adaptive'),
    margin: z.number().min(0.01).max(0.5),
    minPerStratum: z.number().int().min(1).max(BENCH_LIMITS.minPerStratum),
    maxBattles: z.number().int().min(1).max(BENCH_LIMITS.maxBattles),
  }),
]);

export const BenchLevelsSchema = z.object({ team: BotLevelSchema, opponent: BotLevelSchema });

/** The second version of an A/B comparison: another saved team or pasted text. */
export const BenchVersusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('saved'), teamId: TeamIdSchema }),
  z.object({ kind: z.literal('text'), text: TeamTextSchema, name: TeamNameSchema.optional() }),
]);

/** `POST /api/bench`: starts a bench (one at a time). */
export const StartBenchRequestSchema = z.object({
  teamId: TeamIdSchema,
  versus: BenchVersusSchema.optional(),
  opponentIds: z
    .array(OpponentIdSchema)
    .min(1, 'Elige al menos un rival.')
    .max(BENCH_LIMITS.opponents),
  modes: z.array(GameModeSchema).min(1).max(2),
  levels: BenchLevelsSchema,
  budget: BenchBudgetSchema,
  seed: SeedSchema.optional(),
});

export type BenchBudgetValue = z.infer<typeof BenchBudgetSchema>;
export type BenchVersus = z.infer<typeof BenchVersusSchema>;
export type StartBenchRequest = z.infer<typeof StartBenchRequestSchema>;

/** `POST /api/bench` answer: follow it on the WebSocket with `bench:watch`. */
export interface StartBenchResponse {
  benchId: string;
}

// ── Summary ────────────────────────────────────────────────────────────────

const RateSchema = z.number().min(0).max(1);
const IntervalSchema = z.tuple([z.number(), z.number()]);
const count = z.number().int().min(0);

export const EstimateSchema = z.object({ mean: z.number(), interval: IntervalSchema });

export const TallySummarySchema = z.object({
  wins: count,
  losses: count,
  ties: count,
  errors: count,
  played: count,
  winRate: RateSchema.nullable(),
  interval: IntervalSchema,
  avgTurns: z.number().min(0),
});

export const StratumSummarySchema = z.object({
  opponentId: z.string(),
  opponentName: z.string(),
  mode: GameModeSchema,
  team: TallySummarySchema,
  versus: TallySummarySchema.optional(),
  difference: EstimateSchema.extend({ pairs: count }).optional(),
});

export const TotalSummarySchema = z.object({
  team: EstimateSchema.nullable(),
  versus: EstimateSchema.nullable().optional(),
  difference: EstimateSchema.nullable().optional(),
});

export const BenchStopReasonSchema = z.enum([
  'fixed',
  'margin',
  'clear-difference',
  'cap',
  'cancelled',
  'nothing-to-play',
]);

export const BenchStatusSchema = z.enum(['running', 'done', 'cancelled', 'error']);

export const BenchSummarySchema = z.object({
  status: BenchStatusSchema,
  strata: z.array(StratumSummarySchema),
  total: TotalSummarySchema,
  byMode: z.object({
    singles: TotalSummarySchema.optional(),
    doubles: TotalSummarySchema.optional(),
  }),
  skipped: z.array(
    z.object({
      mode: GameModeSchema,
      who: z.enum(['team', 'versus', 'opponent']),
      opponentId: z.string().optional(),
      name: z.string(),
      problems: z.array(z.string()),
    }),
  ),
  battles: z.object({ played: count, planned: count, errors: count, invalidChoices: count }),
  avgDecisionMs: z.number().min(0),
  elapsedMs: z.number().min(0),
  stopReason: BenchStopReasonSchema.optional(),
  failures: z.array(
    z.object({
      opponentId: z.string(),
      opponentName: z.string(),
      mode: GameModeSchema,
      index: count,
      variant: z.union([z.literal(0), z.literal(1)]),
      seed: z.string(),
      teamSide: SideIdSchema,
      error: z.string(),
    }),
  ),
});

export type BenchSummaryValue = z.infer<typeof BenchSummarySchema>;
export type StratumSummaryValue = z.infer<typeof StratumSummarySchema>;
export type EstimateValue = z.infer<typeof EstimateSchema>;
export type TallySummaryValue = z.infer<typeof TallySummarySchema>;

// ── Saved benches ──────────────────────────────────────────────────────────

/** A version of the team as it was when measured (the saved team may change later). */
export const BenchTeamSnapshotSchema = z.object({
  /** Id of the saved team (absent for pasted text). */
  teamId: TeamIdSchema.optional(),
  name: z.string().max(100),
  members: z.array(PokemonSetSchema),
});

/** What was asked for, with the teams as they were. */
export const BenchSetupSchema = z.object({
  team: BenchTeamSnapshotSchema,
  versus: BenchTeamSnapshotSchema.optional(),
  opponents: z.array(z.object({ id: OpponentIdSchema, name: z.string() })),
  modes: z.array(GameModeSchema),
  levels: BenchLevelsSchema,
  budget: BenchBudgetSchema,
  seed: z.string(),
});

/** The stored content of a finished (or cancelled) bench: the history of the team. */
export const BenchContentSchema = z.object({
  setup: BenchSetupSchema,
  summary: BenchSummarySchema,
});

export const SavedBenchSchema = BenchContentSchema.extend({ id: BenchIdSchema });

export type BenchSetup = z.infer<typeof BenchSetupSchema>;
export type BenchContent = z.infer<typeof BenchContentSchema>;
export type SavedBench = z.infer<typeof SavedBenchSchema>;

/** `GET /api/bench` (optionally `?teamId=`): one entry per saved bench, most recent first. */
export interface BenchListEntry {
  id: string;
  teamId?: string;
  teamName: string;
  versusName?: string;
  modes: z.infer<typeof GameModeSchema>[];
  levels: z.infer<typeof BenchLevelsSchema>;
  opponents: number;
  status: z.infer<typeof BenchStatusSchema>;
  total: z.infer<typeof TotalSummarySchema>;
  battles: number;
  /** ISO date of the save. */
  updatedAt: string;
}

export interface ListBenchesResponse {
  benches: BenchListEntry[];
  /** The bench running now, if any (only one at a time). */
  running: { benchId: string; teamName: string } | null;
}

/** `GET /api/bench/:id`. */
export interface BenchResponse {
  bench: SavedBench;
  updatedAt: string;
}

export const ListBenchesQuerySchema = z.object({ teamId: TeamIdSchema.optional() });

// ── WebSocket ──────────────────────────────────────────────────────────────

/** Client → server: follow a bench (the server answers with its state right away). */
export const BenchClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bench:watch'), benchId: BenchIdSchema }),
]);

export const BenchServerMessageSchema = z.discriminatedUnion('type', [
  /** The table so far (sent at most a few times per second). */
  z.object({
    type: z.literal('bench:progress'),
    benchId: BenchIdSchema,
    setup: BenchSetupSchema,
    summary: BenchSummarySchema,
  }),
  /** The bench ended (done or cancelled) and was saved under `benchId`. */
  z.object({
    type: z.literal('bench:result'),
    benchId: BenchIdSchema,
    setup: BenchSetupSchema,
    summary: BenchSummarySchema,
  }),
  z.object({
    type: z.literal('bench:error'),
    benchId: BenchIdSchema.optional(),
    kind: z.enum(['message', 'not-found', 'internal']),
    /** Spanish, for the user. */
    message: z.string(),
  }),
]);

export type BenchClientMessage = z.infer<typeof BenchClientMessageSchema>;
export type BenchServerMessage = z.infer<typeof BenchServerMessageSchema>;
