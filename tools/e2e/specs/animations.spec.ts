/**
 * Battle animations (ADR-0020): a turn plays with the fast setting and the controls come back
 * when it ends; the gallery plays a move without errors.
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'colleja:settings',
      JSON.stringify({ state: { animations: 'fast' }, version: 0 }),
    );
  });
});

test('animates a turn and gives the controls back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('/');
  await page.getByRole('button', { name: 'Equipo aleatorio' }).click();
  await page
    .getByRole('group', { name: 'Dificultad del bot' })
    .getByRole('radio', { name: 'Aleatorio' })
    .check({ force: true });
  await page.getByRole('textbox', { name: 'Semilla' }).fill('e2e-animaciones');
  await page.getByRole('button', { name: 'Combatir' }).click();

  const picks = page.locator('button[aria-pressed]');
  for (let index = 0; index < 3; index++) await picks.nth(index).click();
  await page.getByRole('button', { name: 'Confirmar equipo' }).click();
  await expect(page.getByText('Turno', { exact: true })).toBeVisible();

  await page.keyboard.press('1');
  // The turn plays: the skip button replaces the controls, then the next turn is ready.
  await expect(page.getByRole('button', { name: 'Saltar animación' })).toBeVisible();
  await expect(page.getByText('02', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Saltar animación' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('plays a move in the gallery', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('/animaciones');
  await page.getByRole('button', { name: 'Reproducir' }).click();
  await expect(page.locator('[data-fx="banner"]')).toHaveCount(1);
  await expect(page.locator('[data-fx="banner"]')).toHaveCount(0, { timeout: 5_000 });
  expect(errors).toEqual([]);
});
