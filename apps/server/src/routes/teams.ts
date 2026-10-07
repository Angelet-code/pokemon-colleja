/**
 * Teams: checking pasted text, random teams and the saved teams (CRUD).
 *
 *   POST   /api/teams/validate   text → problems
 *   POST   /api/teams/random     a legal random team
 *   GET    /api/teams            summaries of the saved teams
 *   POST   /api/teams            create (from the editor)
 *   POST   /api/teams/import     create from Showdown export text
 *   GET    /api/teams/:id
 *   PUT    /api/teams/:id
 *   DELETE /api/teams/:id        204
 *
 * Saved teams may be illegal drafts: every response carries their `problems`.
 */
import { randomBytes } from 'node:crypto';
import { DEFAULT_RULESET, formatShowdownTeam } from '@colleja/core';
import {
  API_PREFIX,
  CreateTeamRequestSchema,
  ImportTeamRequestSchema,
  type ListTeamsResponse,
  RandomTeamRequestSchema,
  type RandomTeamResponse,
  TeamContentSchema,
  type TeamResponse,
  type TeamSummary,
  UpdateTeamRequestSchema,
  ValidateTeamRequestSchema,
  type ValidateTeamResponse,
} from '@colleja/protocol';
import { generateTeam } from '@colleja/teamgen';
import type { FastifyInstance } from 'fastify';
import { importMembers, summarize } from '../teams/saved-teams';
import { readTeam, teamProblems } from '../teams/team-problems';
import type { StoredTeam, TeamRepository } from '../teams/team-repository';
import { IdParamsSchema, notFound, parseBody } from './parse-body';

const TEAMS = `${API_PREFIX}/teams`;
const NOT_FOUND = 'Ese equipo no existe.';

export function registerTeamRoutes(app: FastifyInstance, teams: TeamRepository): void {
  app.post(`${TEAMS}/validate`, async (request, reply) => {
    const body = parseBody(ValidateTeamRequestSchema, request.body, reply);
    if (!body) return reply;
    const { team, problems } = readTeam(body.team, body.mode);
    return { valid: problems.length === 0, problems, team } satisfies ValidateTeamResponse;
  });

  app.post(`${TEAMS}/random`, async (request, reply) => {
    const body = parseBody(RandomTeamRequestSchema, request.body ?? {}, reply);
    if (!body) return reply;
    const seed = body.seed ?? randomBytes(4).toString('hex');
    const team = generateTeam(body.mode, { seed });
    return { seed, team, text: formatShowdownTeam(team) } satisfies RandomTeamResponse;
  });

  app.get(TEAMS, async (): Promise<ListTeamsResponse> => {
    const stored = await teams.list();
    return { teams: stored.map(toSummary) };
  });

  app.post(TEAMS, async (request, reply) => {
    const body = parseBody(CreateTeamRequestSchema, request.body, reply);
    if (!body) return reply;
    return reply.code(201).send(toResponse(await teams.create(body.team)));
  });

  app.post(`${TEAMS}/import`, async (request, reply) => {
    const body = parseBody(ImportTeamRequestSchema, request.body, reply);
    if (!body) return reply;
    const { members, adjustments } = importMembers(body.text, body.mode);
    const content = parseBody(
      TeamContentSchema,
      { name: body.name, mode: body.mode, ruleset: DEFAULT_RULESET, members },
      reply,
    );
    if (!content) return reply;
    return reply.code(201).send(toResponse(await teams.create(content), adjustments));
  });

  app.get(`${TEAMS}/:id`, async (request, reply) => {
    const params = parseBody(IdParamsSchema, request.params, reply);
    if (!params) return reply;
    const stored = await teams.get(params.id);
    return stored ? toResponse(stored) : notFound(reply, NOT_FOUND);
  });

  app.put(`${TEAMS}/:id`, async (request, reply) => {
    const params = parseBody(IdParamsSchema, request.params, reply);
    if (!params) return reply;
    const body = parseBody(UpdateTeamRequestSchema, request.body, reply);
    if (!body) return reply;
    const stored = await teams.update(params.id, body.team);
    return stored ? toResponse(stored) : notFound(reply, NOT_FOUND);
  });

  app.delete(`${TEAMS}/:id`, async (request, reply) => {
    const params = parseBody(IdParamsSchema, request.params, reply);
    if (!params) return reply;
    return (await teams.delete(params.id)) ? reply.code(204).send() : notFound(reply, NOT_FOUND);
  });
}

function toResponse({ team, updatedAt }: StoredTeam, adjustments: string[] = []): TeamResponse {
  return { team, problems: teamProblems(team.members, team.mode), adjustments, updatedAt };
}

function toSummary({ team, updatedAt }: StoredTeam): TeamSummary {
  return summarize(team, updatedAt);
}
