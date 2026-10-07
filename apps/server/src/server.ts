/**
 * The local server: REST API, battle WebSocket, sprites and (in production) the web app.
 * `buildServer` does not listen, so tests use `inject` / `injectWS`.
 */
import { existsSync } from 'node:fs';
import { API_PREFIX } from '@colleja/protocol';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { BattleManager, type BattleManagerOptions } from './battles/battle-manager';
import { SPRITES_DIR, TEAMS_DIR, WEB_DIST_DIR } from './config';
import { registerApi } from './routes/api';
import { registerBattleSocket } from './routes/battle-socket';
import { FileTeamRepository } from './teams/team-repository';

export interface ServerOptions extends BattleManagerOptions {
  logger?: FastifyServerOptions['logger'];
  /** Folder served at `/sprites/` (omitted or missing: 404, the UI falls back to text). */
  spritesDir?: string | null;
  /** Built web app served at `/` (omitted or missing: API only, Vite serves the UI). */
  webDir?: string | null;
  /** How often idle battles are swept (ms). `0` disables the timer (tests). */
  sweepIntervalMs?: number;
  /** Folder of the saved teams (default `storage/teams/`; tests use a temporary one). */
  teamsDir?: string;
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const teams = new FileTeamRepository(options.teamsDir ?? TEAMS_DIR, {
    onInvalid: (file, reason) =>
      app.log.warn({ file, reason }, 'Equipo guardado ilegible: se ignora'),
  });
  const battles = new BattleManager(teams, options);

  await app.register(fastifyWebsocket);
  registerApi(app, teams);
  registerBattleSocket(app, battles);

  const spritesDir = options.spritesDir === undefined ? SPRITES_DIR : options.spritesDir;
  if (spritesDir && existsSync(spritesDir)) {
    await app.register(fastifyStatic, {
      root: spritesDir,
      prefix: '/sprites/',
      decorateReply: false,
    });
  }

  const webDir = options.webDir === undefined ? WEB_DIST_DIR : options.webDir;
  if (webDir && existsSync(webDir)) {
    await app.register(fastifyStatic, { root: webDir, prefix: '/', wildcard: false });
    // Client-side routes (React Router): unknown paths outside the API get the app shell.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith(API_PREFIX)) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'No encontrado.' });
    });
  }

  const sweepIntervalMs = options.sweepIntervalMs ?? 60_000;
  if (sweepIntervalMs > 0) {
    const timer = setInterval(() => battles.sweep(), sweepIntervalMs);
    timer.unref();
    app.addHook('onClose', async () => clearInterval(timer));
  }
  app.addHook('onClose', async () => battles.disposeAll());
  app.decorate('battles', battles);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Battles in memory (exposed for tests and diagnostics). */
    battles: BattleManager;
  }
}
