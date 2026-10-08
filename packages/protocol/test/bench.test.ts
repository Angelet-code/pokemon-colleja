import {
  type BenchServerMessage,
  BenchServerMessageSchema,
  type BenchSetup,
  type BenchSummaryValue,
  parseBenchClientMessage,
  SavedBenchSchema,
  type StartBenchRequest,
  StartBenchRequestSchema,
} from '@colleja/protocol';
import { describe, expect, it } from 'vitest';

const tally = {
  wins: 3,
  losses: 2,
  ties: 1,
  errors: 1,
  played: 6,
  winRate: 0.583,
  interval: [0.28, 0.84] as [number, number],
  avgTurns: 9.5,
};

const summary: BenchSummaryValue = {
  status: 'running',
  strata: [
    {
      opponentId: 'r1',
      opponentName: 'Rival 1',
      mode: 'doubles',
      team: tally,
      versus: { ...tally, wins: 4, losses: 1 },
      difference: { mean: 0.1, interval: [-0.2, 0.4], pairs: 6 },
    },
  ],
  total: {
    team: { mean: 0.58, interval: [0.4, 0.75] },
    versus: { mean: 0.7, interval: [0.5, 0.85] },
    difference: { mean: 0.1, interval: [-0.2, 0.4] },
  },
  byMode: { doubles: { team: { mean: 0.58, interval: [0.4, 0.75] } } },
  skipped: [
    { mode: 'singles', who: 'opponent', opponentId: 'r2', name: 'Rival 2', problems: ['x'] },
  ],
  battles: { played: 14, planned: 12, errors: 1, invalidChoices: 0 },
  avgDecisionMs: 950,
  elapsedMs: 12_000,
  stopReason: 'margin',
  failures: [
    {
      opponentId: 'r1',
      opponentName: 'Rival 1',
      mode: 'doubles',
      index: 3,
      variant: 0,
      seed: 's:r1:doubles:3',
      teamSide: 'p2',
      error: 'pass',
    },
  ],
};

const setup: BenchSetup = {
  team: { teamId: 't1', name: 'Mi equipo', members: [] },
  versus: { name: 'Versión B', members: [] },
  opponents: [{ id: 'r1', name: 'Rival 1' }],
  modes: ['doubles'],
  levels: { team: 3, opponent: 3 },
  budget: { kind: 'adaptive', margin: 0.05, minPerStratum: 6, maxBattles: 40 },
  seed: 'abc',
};

describe('bench protocol', () => {
  it('validates start requests', () => {
    const request: StartBenchRequest = {
      teamId: 't1',
      versus: { kind: 'text', text: 'Garchomp @ Life Orb', name: 'B' },
      opponentIds: ['r1', 'r2'],
      modes: ['singles', 'doubles'],
      levels: { team: 3, opponent: 2 },
      budget: { kind: 'fixed', battles: 20 },
    };
    expect(StartBenchRequestSchema.parse(request)).toEqual(request);
    expect(StartBenchRequestSchema.safeParse({ ...request, opponentIds: [] }).success).toBe(false);
    expect(
      StartBenchRequestSchema.safeParse({ ...request, budget: { kind: 'fixed', battles: 0 } })
        .success,
    ).toBe(false);
    expect(
      StartBenchRequestSchema.safeParse({
        ...request,
        budget: { kind: 'adaptive', margin: 0.9, minPerStratum: 6, maxBattles: 10 },
      }).success,
    ).toBe(false);
  });

  it('round-trips progress, results and errors', () => {
    const messages: BenchServerMessage[] = [
      { type: 'bench:progress', benchId: 'b1', setup, summary },
      { type: 'bench:result', benchId: 'b1', setup, summary: { ...summary, status: 'done' } },
      { type: 'bench:error', benchId: 'b1', kind: 'not-found', message: 'Ese banco no existe.' },
    ];
    for (const message of messages) {
      expect(BenchServerMessageSchema.parse(JSON.parse(JSON.stringify(message)))).toEqual(message);
    }
    expect(SavedBenchSchema.parse({ id: 'b1', setup, summary })).toEqual({
      id: 'b1',
      setup,
      summary,
    });
  });

  it('parses the watch message', () => {
    expect(parseBenchClientMessage(JSON.stringify({ type: 'bench:watch', benchId: 'b1' }))).toEqual(
      { ok: true, message: { type: 'bench:watch', benchId: 'b1' } },
    );
    expect(parseBenchClientMessage('{').ok).toBe(false);
    expect(
      parseBenchClientMessage(JSON.stringify({ type: 'bench:watch', benchId: '../x' })).ok,
    ).toBe(false);
  });
});
