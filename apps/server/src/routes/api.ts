/** REST API (`/api/*`). */
import { randomBytes } from 'node:crypto';
import { BOT_LEVELS, DEFAULT_BOT_LEVEL } from '@colleja/bot';
import { formatShowdownTeam } from '@colleja/core';
import { meta } from '@colleja/data';
import {
  API_PREFIX,
  type ApiError,
  type MetaResponse,
  RandomTeamRequestSchema,
  type RandomTeamResponse,
  ValidateTeamRequestSchema,
  type ValidateTeamResponse,
} from '@colleja/protocol';
import { generateTeam } from '@colleja/teamgen';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { z } from 'zod';
import { readTeam } from '../teams';

export function registerApi(app: FastifyInstance): void {
  app.get(
    `${API_PREFIX}/meta`,
    async (): Promise<MetaResponse> => ({
      regulation: meta.regulation,
      showdown: { ...meta.showdown },
      // Typed with the protocol's levels: this stops compiling if the bot levels ever diverge.
      botLevels: BOT_LEVELS.map(({ level, name, description }) => ({ level, name, description })),
      defaultBotLevel: DEFAULT_BOT_LEVEL,
    }),
  );

  app.post(`${API_PREFIX}/teams/validate`, async (request, reply) => {
    const body = parseBody(ValidateTeamRequestSchema, request.body, reply);
    if (!body) return reply;
    const { team, problems } = readTeam(body.team, body.mode);
    return { valid: problems.length === 0, problems, team } satisfies ValidateTeamResponse;
  });

  app.post(`${API_PREFIX}/teams/random`, async (request, reply) => {
    const body = parseBody(RandomTeamRequestSchema, request.body ?? {}, reply);
    if (!body) return reply;
    const seed = body.seed ?? randomBytes(4).toString('hex');
    const team = generateTeam(body.mode, { seed });
    return { seed, team, text: formatShowdownTeam(team) } satisfies RandomTeamResponse;
  });
}

/** Validates a JSON body; on failure answers 400 with the problems and returns `null`. */
function parseBody<T extends z.ZodType>(
  schema: T,
  body: unknown,
  reply: FastifyReply,
): z.infer<T> | null {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const error: ApiError = {
    error: 'Petición no válida.',
    details: result.error.issues.map(
      (issue) => `${issue.path.join('.') || 'cuerpo'}: ${issue.message}`,
    ),
  };
  reply.code(400).send(error);
  return null;
}
