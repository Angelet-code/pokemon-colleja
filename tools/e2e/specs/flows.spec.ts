/**
 * Main flows, in order: import a team, battle with it against the level 0 bot (team preview,
 * a move, "Calcular", forfeit), save the replay, then rename, watch and delete it.
 */
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

const TEAM = readFileSync(new URL('../../smoke/fixtures/equipo-a.txt', import.meta.url), 'utf8');
const TEAM_NAME = 'Equipo E2E';

test.describe.configure({ mode: 'serial' });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});

test.afterAll(async () => {
  await page.close();
});

test('imports a team and saves it', async () => {
  await page.goto('/equipos');
  await page.getByRole('button', { name: 'Importar' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre').fill(TEAM_NAME);
  await dialog.getByLabel('Equipo en formato de Showdown').fill(TEAM);
  await dialog.getByRole('button', { name: 'Importar y editar' }).click();
  await expect(page).toHaveURL(/\/equipos\/[\w-]+$/);

  await page.goto('/equipos');
  const row = page.getByRole('listitem').filter({ hasText: TEAM_NAME });
  await expect(row.getByText('Legal')).toBeVisible();
  await row.getByRole('button', { name: 'Usar en combate' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('battles the bot with the saved team and opens the calculator', async () => {
  await expect(page.getByRole('radio', { name: TEAM_NAME })).toBeChecked();
  await page
    .getByRole('group', { name: 'Dificultad del bot' })
    .getByRole('radio', { name: 'Aleatorio' })
    .check({ force: true });
  await page.getByRole('textbox', { name: 'Semilla' }).fill('e2e');
  await page.getByRole('button', { name: 'Combatir' }).click();
  await expect(page).toHaveURL(/\/combate$/);

  // Team preview: the first three, in order.
  const picks = page.locator('button[aria-pressed]');
  for (let index = 0; index < 3; index++) await picks.nth(index).click();
  await page.getByRole('button', { name: 'Confirmar equipo' }).click();
  await expect(page.getByText('Turno', { exact: true })).toBeVisible();

  // First move with its keyboard shortcut.
  await page.keyboard.press('1');
  await expect(page.getByText('02', { exact: true })).toBeVisible({ timeout: 15_000 });

  const [calculator] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByRole('button', { name: 'Calcular' }).click(),
  ]);
  await calculator.waitForLoadState();
  await expect(calculator).toHaveURL(/\/calculadora$/);
  await expect(calculator.getByRole('table')).toBeVisible();
  await expect(calculator.getByLabel('PS del atacante (%)')).not.toHaveValue('');
  await calculator.close();
});

test('forfeits and saves the replay', async () => {
  await page.getByRole('button', { name: 'Rendirse' }).click();
  await page.getByRole('button', { name: 'Sí, rendirse' }).click();
  await expect(page.getByText('Derrota')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar replay' }).click();
  await expect(page.getByRole('link', { name: 'Ver replay' })).toBeVisible();
});

test('renames, watches and deletes the replay', async () => {
  await page.goto('/replays');
  const list = page.getByRole('list', { name: 'Replays guardados' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await list.getByRole('button', { name: 'Renombrar' }).click();
  await page.getByLabel('Nombre del replay').fill('Primera derrota');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(list.getByRole('link', { name: 'Primera derrota' })).toBeVisible();

  await list.getByRole('link', { name: 'Primera derrota' }).click();
  await expect(page.getByRole('heading', { name: 'Primera derrota' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Turnos' })).toBeVisible();

  await page.goto('/replays');
  await list.getByRole('button', { name: 'Borrar' }).click();
  await page.getByRole('button', { name: 'Sí, borrar' }).click();
  await expect(page.getByText('Aún no has guardado ningún replay')).toBeVisible();
});
