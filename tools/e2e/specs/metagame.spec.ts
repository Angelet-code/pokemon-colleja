/**
 * The metagame in the rivals page: a snapshot written in the temporary storage (no network),
 * its teams listed read only with their share, and one copied to «Mis rivales» to edit it.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const fixture = (name: string) =>
  readFileSync(new URL(`../../smoke/fixtures/${name}.txt`, import.meta.url), 'utf8');

test('lists the metagame and copies a team to «Mis rivales»', async ({ page }) => {
  // The members as the server reads them: import the fixture once as an opponent.
  const imported = await page.request.post('/api/opponents/import', {
    data: { text: fixture('equipo-b'), name: 'Origen', mode: 'singles', botLevel: 2 },
  });
  expect(imported.ok()).toBe(true);
  const { members } = (await imported.json()).opponent;

  const dir = join(process.env.E2E_STORAGE_DIR as string, 'metagame');
  mkdirSync(dir, { recursive: true });
  const snapshot = {
    id: '2026-09-1760',
    month: '2026-09',
    cutoff: 1760,
    createdAt: '2026-10-12T00:00:00.000Z',
    sources: [],
    teams: [
      { id: 'singles-01', name: 'Meta E2E', mode: 'singles', archetype: '', weight: 1, members },
    ],
  };
  writeFileSync(
    join(dir, '2026-09-1760.json'),
    JSON.stringify({ version: 1, updatedAt: snapshot.createdAt, snapshot }),
  );

  await page.goto('/rivales');
  // Switching section mounts the other one (with its own selector): click, then follow the URL.
  await page.getByRole('radio', { name: 'Meta' }).click({ force: true });
  await expect(page).toHaveURL(/seccion=meta/);
  const list = page.getByRole('list', { name: 'Meta de individuales' });
  await expect(list.getByText('Meta E2E')).toBeVisible();
  await expect(list.getByText('100,0 %')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Borrar' })).toHaveCount(0);

  await list.getByRole('button', { name: 'Copiar a mis rivales' }).click();
  await expect(page).toHaveURL(/\/rivales\/[0-9a-f-]+$/);
  await expect(page.getByRole('textbox', { name: 'Nombre del rival' })).toHaveValue(/Meta E2E/);
});
