/**
 * The metagame: read-only rivals built from the ladder (fase 20, ADR-0022).
 *
 *   GET  /api/metagame                                   the active snapshot and its teams
 *   GET  /api/metagame/latest                            newest month published by Smogon
 *   POST /api/metagame/update                            starts the update (202; 409 if running)
 *   GET  /api/metagame/:snapshotId/teams/:teamId         one team
 *   POST /api/metagame/:snapshotId/teams/:teamId/copy    copies it to the saved opponents (201)
 *
 * There is no way to change or delete a metagame team: copy it to edit it.
 */
import { DEFAULT_RULESET } from '@colleja/core';
import {
  API_PREFIX,
  type ApiError,
  CopyMetagameTeamRequestSchema,
  type MetagameResponse,
  MetagameSnapshotIdSchema,
  MetagameTeamIdSchema,
  type MetagameTeamResponse,
  type OpponentResponse,
  UpdateMetagameRequestSchema,
} from '@colleja/protocol';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { MetagameManager } from '../metagame/metagame-manager';
import type { OpponentRepository } from '../opponents/opponent-repository';
import { teamProblems } from '../teams/team-problems';
import { notFound, parseBody } from './parse-body';

const METAGAME = `${API_PREFIX}/metagame`;
const NOT_FOUND = 'Ese equipo del meta no existe.';

const TeamParamsSchema = z.object({
  snapshotId: MetagameSnapshotIdSchema,
  teamId: MetagameTeamIdSchema,
});

export function registerMetagameRoutes(
  app: FastifyInstance,
  metagame: MetagameManager,
  opponents: OpponentRepository,
): void {
  app.get(METAGAME, async (): Promise<MetagameResponse> => {
    const snapshot = metagame.active();
    const older = metagame.store.ids().filter((id) => id !== snapshot?.id);
    if (!snapshot) return { snapshot: null, teams: [], older, update: metagame.update };
    const { teams: _teams, sets: _sets, ...info } = snapshot;
    return {
      snapshot: info,
      teams: metagame.teamSummaries(snapshot),
      older,
      update: metagame.update,
    };
  });

  app.get(`${METAGAME}/latest`, async () => metagame.latestMonth());

  app.post(`${METAGAME}/update`, async (request, reply) => {
    const body = parseBody(UpdateMetagameRequestSchema, request.body ?? {}, reply);
    if (!body) return reply;
    if (!metagame.start(body)) {
      const error: ApiError = { error: 'Ya se está actualizando el meta.' };
      return reply.code(409).send(error);
    }
    return reply.code(202).send(metagame.update);
  });

  app.get(`${METAGAME}/:snapshotId/teams/:teamId`, async (request, reply) => {
    const params = parseBody(TeamParamsSchema, request.params, reply);
    if (!params) return reply;
    const team = metagame.team(params.snapshotId, params.teamId);
    if (!team) return notFound(reply, NOT_FOUND);
    return { snapshotId: params.snapshotId, team } satisfies MetagameTeamResponse;
  });

  app.post(`${METAGAME}/:snapshotId/teams/:teamId/copy`, async (request, reply) => {
    const params = parseBody(TeamParamsSchema, request.params, reply);
    if (!params) return reply;
    const body = parseBody(CopyMetagameTeamRequestSchema, request.body, reply);
    if (!body) return reply;
    const team = metagame.team(params.snapshotId, params.teamId);
    if (!team) return notFound(reply, NOT_FOUND);
    const stored = await opponents.create({
      name: `Meta ${params.snapshotId.slice(0, 7)} · ${team.name}`.slice(0, 48),
      mode: team.mode,
      ruleset: DEFAULT_RULESET,
      members: team.members,
      botLevel: body.botLevel,
    });
    const response: OpponentResponse = {
      opponent: stored.opponent,
      problems: teamProblems(stored.opponent.members, stored.opponent.mode),
      adjustments: [],
      updatedAt: stored.updatedAt,
    };
    return reply.code(201).send(response);
  });
}
