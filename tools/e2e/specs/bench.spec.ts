/**
 * Team bench: a saved team against one saved rival, two fixed battles with the level 2 bot
 * (the fastest the page offers), the table filled in and the bench in the team's history.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const fixture = (name: string) =>
  readFileSync(new URL(`../../smoke/fixtures/${name}.txt`, import.meta.url), 'utf8');

test('measures a saved team against a saved rival', async ({ page }) => {
  const team = await page.request.post('/api/teams/import', {
    data: { text: fixture('equipo-a'), name: 'Banco E2E', mode: 'singles' },
  });
  expect(team.ok()).toBe(true);
  const rival = await page.request.post('/api/opponents/import', {
    data: { text: fixture('equipo-b'), name: 'Rival del banco', mode: 'singles', botLevel: 3 },
  });
  expect(rival.ok()).toBe(true);

  await page.goto('/banco');
  await page.getByLabel('Tu equipo').selectOption({ label: 'Banco E2E' });
  await page.getByRole('radio', { name: 'Individuales' }).check({ force: true });
  await page
    .getByRole('group', { name: 'Nivel de tu bot' })
    .getByRole('radio', { name: 'Táctico' })
    .check({ force: true });
  await page
    .getByRole('group', { name: 'Nivel de los rivales' })
    .getByRole('radio', { name: 'Táctico' })
    .check({ force: true });
  await page.getByRole('radio', { name: 'Fijo' }).check({ force: true });
  await page.getByLabel('Combates por rival').fill('2');
  await page.getByRole('button', { name: 'Empezar' }).click();

  const table = page.getByRole('table', { name: 'Resultado por rival' });
  await expect(table.getByRole('rowheader', { name: 'Rival del banco' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Combates fijos jugados')).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole('list', { name: 'Pruebas guardadas' }).getByRole('listitem'),
  ).toHaveCount(1);

  // From the rival's row, straight to a battle against it.
  await table.getByRole('button', { name: 'Jugar contra Rival del banco' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('radio', { name: 'Rival del banco' })).toBeChecked();
});
