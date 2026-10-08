/**
 * E2E tests of the web app (`npm run e2e`): the production build served by the real server,
 * with saved teams, opponents and replays in a temporary folder. Not part of `npm run check`.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3101);
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// The config is loaded again by every worker: keep one storage folder for the run.
process.env.E2E_STORAGE_DIR ??= mkdtempSync(join(tmpdir(), 'colleja-e2e-'));

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'es-ES',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx tsx apps/server/src/main.ts',
    cwd: ROOT,
    url: `http://127.0.0.1:${PORT}/api/meta`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      SERVER_PORT: String(PORT),
      STORAGE_DIR: process.env.E2E_STORAGE_DIR,
      LOG_LEVEL: 'warn',
    },
  },
});
