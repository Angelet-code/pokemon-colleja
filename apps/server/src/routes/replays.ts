/**
 * Saved replays. They are created from a finished battle (`battle:save-replay` on the
 * WebSocket), never by REST: the server is the only source of a replay.
 *
 *   GET    /api/replays          summaries, most recent first
 *   GET    /api/replays/:id      the full replay (omniscient: the battle is over)
 *   PATCH  /api/replays/:id      renames it ({ name })
 *   DELETE /api/replays/:id      204
 */
import {
  API_PREFIX,
  type ListReplaysResponse,
  RenameReplayRequestSchema,
  type ReplaySummary,
} from '@colleja/protocol';
import type { FastifyInstance } from 'fastify';
import type { ReplayRepository, StoredReplay } from '../replays/replay-repository';
import { IdParamsSchema, notFound, parseBody } from './parse-body';

const REPLAYS = `${API_PREFIX}/replays`;
const NOT_FOUND = 'Ese replay no existe.';

export function registerReplayRoutes(app: FastifyInstance, replays: ReplayRepository): void {
  app.get(REPLAYS, async (): Promise<ListReplaysResponse> => {
    const stored = await replays.list();
    return { replays: stored.map(toSummary) };
  });

  app.get(`${REPLAYS}/:id`, async (request, reply) => {
    const params = parseBody(IdParamsSchema, request.params, reply);
    if (!params) return reply;
    const stored = await replays.get(params.id);
    return stored ? stored : notFound(reply, NOT_FOUND);
  });

  app.patch(`${REPLAYS}/:id`, async (request, reply) => {
    const params = parseBody(IdParamsSchema, request.params, reply);
    if (!params) return reply;
    const body = parseBody(RenameReplayRequestSchema, request.body, reply);
    if (!body) return reply;
    const stored = await replays.get(params.id);
    if (!stored) return notFound(reply, NOT_FOUND);
    const { id: _, ...content } = stored.replay;
    const renamed = await replays.update(params.id, { ...content, name: body.name });
    return renamed ?? notFound(reply, NOT_FOUND);
  });

  app.delete(`${REPLAYS}/:id`, async (request, reply) => {
    const params = parseBody(IdParamsSchema, request.params, reply);
    if (!params) return reply;
    return (await replays.delete(params.id)) ? reply.code(204).send() : notFound(reply, NOT_FOUND);
  });
}

function toSummary({ replay: saved, updatedAt }: StoredReplay): ReplaySummary {
  const { replay } = saved;
  return {
    id: saved.id,
    name: saved.name,
    mode: replay.mode,
    players: { p1: replay.players.p1.name, p2: replay.players.p2.name },
    species: {
      p1: replay.players.p1.team.map((set) => set.species),
      p2: replay.players.p2.team.map((set) => set.species),
    },
    winner: replay.winner ?? null,
    turns: replay.turns,
    botLevel: saved.botLevel,
    opponentKind: saved.opponentKind,
    updatedAt,
  };
}
