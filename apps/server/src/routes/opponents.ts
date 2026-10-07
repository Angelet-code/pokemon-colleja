/**
 * Saved opponents (CRUD): a team for the bot plus its difficulty.
 *
 *   GET    /api/opponents            summaries of the saved opponents
 *   POST   /api/opponents            create (from the editor)
 *   POST   /api/opponents/import     create from Showdown export text
 *   GET    /api/opponents/:id
 *   PUT    /api/opponents/:id
 *   DELETE /api/opponents/:id        204
 *
 * Like teams, saved opponents may be illegal drafts: every response carries their `problems`.
 */
import { DEFAULT_RULESET } from '@colleja/core';
import {
  API_PREFIX,
  CreateOpponentRequestSchema,
  ImportOpponentRequestSchema,
  type ListOpponentsResponse,
  OpponentContentSchema,
  type OpponentResponse,
  type OpponentSummary,
  UpdateOpponentRequestSchema,
} from '@colleja/protocol';
import type { FastifyInstance } from 'fastify';
import type { OpponentRepository, StoredOpponent } from '../opponents/opponent-repository';
import { importMembers, summarize } from '../teams/saved-teams';
import { teamProblems } from '../teams/team-problems';
import { IdParamsSchema, notFound, parseBody } from './parse-body';

const OPPONENTS = `${API_PREFIX}/opponents`;
const NOT_FOUND = 'Ese rival no existe.';

export function registerOpponentRoutes(app: FastifyInstance, opponents: OpponentRepository): void {
  app.get(OPPONENTS, async (): Promise<ListOpponentsResponse> => {
    const stored = await opponents.list();
    return { opponents: stored.map(toSummary) };
  });

  app.post(OPPONENTS, async (request, reply) => {
    const body = parseBody(CreateOpponentRequestSchema, request.body, reply);
    if (!body) return reply;
    return reply.code(201).send(toResponse(await opponents.create(body.opponent)));
  });

  app.post(`${OPPONENTS}/import`, async (request, reply) => {
    const body = parseBody(ImportOpponentRequestSchema, request.body, reply);
    if (!body) return reply;
    const { members, adjustments } = importMembers(body.text, body.mode);
    const content = parseBody(
      OpponentContentSchema,
      {
        name: body.name,
        mode: body.mode,
        ruleset: DEFAULT_RULESET,
        members,
        botLevel: body.botLevel,
      },
      reply,
    );
    if (!content) return reply;
    return reply.code(201).send(toResponse(await opponents.create(content), adjustments));
  });

  app.get(`${OPPONENTS}/:id`, async (request, reply) => {
    const params = parseBody(IdParamsSchema, request.params, reply);
    if (!params) return reply;
    const stored = await opponents.get(params.id);
    return stored ? toResponse(stored) : notFound(reply, NOT_FOUND);
  });

  app.put(`${OPPONENTS}/:id`, async (request, reply) => {
    const params = parseBody(IdParamsSchema, request.params, reply);
    if (!params) return reply;
    const body = parseBody(UpdateOpponentRequestSchema, request.body, reply);
    if (!body) return reply;
    const stored = await opponents.update(params.id, body.opponent);
    return stored ? toResponse(stored) : notFound(reply, NOT_FOUND);
  });

  app.delete(`${OPPONENTS}/:id`, async (request, reply) => {
    const params = parseBody(IdParamsSchema, request.params, reply);
    if (!params) return reply;
    return (await opponents.delete(params.id))
      ? reply.code(204).send()
      : notFound(reply, NOT_FOUND);
  });
}

function toResponse(
  { opponent, updatedAt }: StoredOpponent,
  adjustments: string[] = [],
): OpponentResponse {
  return {
    opponent,
    problems: teamProblems(opponent.members, opponent.mode),
    adjustments,
    updatedAt,
  };
}

function toSummary({ opponent, updatedAt }: StoredOpponent): OpponentSummary {
  return { ...summarize(opponent, updatedAt), botLevel: opponent.botLevel };
}
