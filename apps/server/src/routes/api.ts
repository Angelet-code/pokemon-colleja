/** REST API (`/api/*`): metadata here, teams in `teams.ts`. */
import { BOT_LEVELS, DEFAULT_BOT_LEVEL } from '@colleja/bot';
import { meta } from '@colleja/data';
import { API_PREFIX, type MetaResponse } from '@colleja/protocol';
import type { FastifyInstance } from 'fastify';
import type { TeamRepository } from '../teams/team-repository';
import { registerTeamRoutes } from './teams';

export function registerApi(app: FastifyInstance, teams: TeamRepository): void {
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

  registerTeamRoutes(app, teams);
}
