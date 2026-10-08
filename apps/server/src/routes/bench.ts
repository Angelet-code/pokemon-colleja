/**
 * The team bench. Progress and the result go through the bench WebSocket (`bench:watch`).
 *
 *   POST   /api/bench          starts one ({ teamId, opponentIds, modes, levels, budget… }) → { benchId }
 *   GET    /api/bench          the history (optionally `?teamId=`) and the bench running now
 *   GET    /api/bench/:id      a saved bench
 *   DELETE /api/bench/:id      cancels it if it is running; otherwise deletes it (204)
 */
import {
  API_PREFIX,
  type ApiError,
  type BenchListEntry,
  ListBenchesQuerySchema,
  type ListBenchesResponse,
  StartBenchRequestSchema,
  type StartBenchResponse,
} from '@colleja/protocol';
import type { FastifyInstance } from 'fastify';
import { type BenchManager, BenchRequestError } from '../bench/bench-manager';
import type { BenchRepository, StoredBench } from '../bench/bench-repository';
import { IdParamsSchema, notFound, parseBody } from './parse-body';

const BENCH = `${API_PREFIX}/bench`;
const NOT_FOUND = 'Ese banco no existe.';

export function registerBenchRoutes(
  app: FastifyInstance,
  manager: BenchManager,
  benches: BenchRepository,
): void {
  app.post(BENCH, async (request, reply) => {
    const body = parseBody(StartBenchRequestSchema, request.body, reply);
    if (!body) return reply;
    try {
      const benchId = await manager.start(body);
      return reply.code(201).send({ benchId } satisfies StartBenchResponse);
    } catch (error) {
      if (!(error instanceof BenchRequestError)) throw error;
      const answer: ApiError = { error: error.message };
      if (error.details.length > 0) answer.details = error.details;
      return reply.code(error.status).send(answer);
    }
  });

  app.get(BENCH, async (request, reply) => {
    const query = parseBody(ListBenchesQuerySchema, request.query ?? {}, reply);
    if (!query) return reply;
    const stored = await benches.list();
    const entries = stored
      .map(toEntry)
      .filter((entry) => query.teamId === undefined || entry.teamId === query.teamId);
    return { benches: entries, running: manager.current } satisfies ListBenchesResponse;
  });

  app.get(`${BENCH}/:id`, async (request, reply) => {
    const params = parseBody(IdParamsSchema, request.params, reply);
    if (!params) return reply;
    const stored = await benches.get(params.id);
    return stored ?? notFound(reply, NOT_FOUND);
  });

  app.delete(`${BENCH}/:id`, async (request, reply) => {
    const params = parseBody(IdParamsSchema, request.params, reply);
    if (!params) return reply;
    if (manager.cancel(params.id)) return reply.code(204).send();
    return (await benches.delete(params.id)) ? reply.code(204).send() : notFound(reply, NOT_FOUND);
  });
}

function toEntry({ bench, updatedAt }: StoredBench): BenchListEntry {
  const { setup, summary } = bench;
  const entry: BenchListEntry = {
    id: bench.id,
    teamName: setup.team.name,
    modes: setup.modes,
    levels: setup.levels,
    opponents: setup.opponents.length,
    status: summary.status,
    total: summary.total,
    battles: summary.battles.planned,
    updatedAt,
  };
  if (setup.team.teamId) entry.teamId = setup.team.teamId;
  if (setup.versus) entry.versusName = setup.versus.name;
  return entry;
}
