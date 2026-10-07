/** REST API (`/api/*`): metadata here, teams in `teams.ts`, opponents in `opponents.ts`. */
import { BOT_LEVELS, DEFAULT_BOT_LEVEL } from '@colleja/bot';
import { meta } from '@colleja/data';
import { API_PREFIX, type MetaResponse } from '@colleja/protocol';
import type { FastifyInstance } from 'fastify';
import type { Repositories } from '../storage/repositories';
import { registerOpponentRoutes } from './opponents';
import { registerTeamRoutes } from './teams';

export function registerApi(app: FastifyInstance, repositories: Repositories): void {
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

  registerTeamRoutes(app, repositories.teams);
  registerOpponentRoutes(app, repositories.opponents);
}
