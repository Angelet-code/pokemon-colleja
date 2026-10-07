/**
 * Starts the local server: `npm run dev` (with Vite) or `npm start` (serving the built web).
 *
 *   SERVER_PORT=3001 SERVER_HOST=127.0.0.1 LOG_LEVEL=info
 *
 * (Own variable names: tools that launch dev servers often set `PORT` for the web app.)
 */
import { DEFAULT_HOST, DEFAULT_PORT } from './config';
import { buildServer } from './server';

const port = Number(process.env.SERVER_PORT ?? DEFAULT_PORT);
const host = process.env.SERVER_HOST ?? DEFAULT_HOST;
const app = await buildServer({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

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
