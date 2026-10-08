/**
 * Starts the local server: `npm run dev` (with Vite) or `npm start` (serving the built web).
 *
 *   SERVER_PORT=3001 SERVER_HOST=127.0.0.1 LOG_LEVEL=info STORAGE_DIR=storage
 *
 * (Own variable names: tools that launch dev servers often set `PORT` for the web app.)
 * `STORAGE_DIR` moves the saved teams, opponents, replays and benches elsewhere (the E2E tests use a
 * temporary folder). `WEB_DEV_URL` (set by `npm run dev`) sends page requests to Vite instead of
 * serving `apps/web/dist`, which may be an old build.
 */
import { join } from 'node:path';
import { DEFAULT_HOST, DEFAULT_PORT } from './config';
import { buildServer } from './server';

const port = Number(process.env.SERVER_PORT ?? DEFAULT_PORT);
const host = process.env.SERVER_HOST ?? DEFAULT_HOST;
const storage = process.env.STORAGE_DIR;
const devWebUrl = process.env.WEB_DEV_URL;
const app = await buildServer({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  ...(devWebUrl ? { devWebUrl } : {}),
  ...(storage
    ? {
        teamsDir: join(storage, 'teams'),
        opponentsDir: join(storage, 'opponents'),
        replaysDir: join(storage, 'replays'),
        benchDir: join(storage, 'bench'),
      }
    : {}),
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().finally(() => process.exit(0));
  });
}

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
