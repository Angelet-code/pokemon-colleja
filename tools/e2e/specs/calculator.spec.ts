/** The damage calculator: results from the server, critical hits and doubles effects. */
import { expect, test } from '@playwright/test';

test('recomputes the damage with a critical hit and Helping Hand', async ({ page }) => {
  await page.goto('/calculadora');
  const firstRange = page.getByRole('table').getByRole('row').nth(1).getByRole('cell').first();
  await expect(firstRange).toHaveText(/\d+–\d+/);
  const normal = await firstRange.textContent();

  await page.getByText('Crítico', { exact: true }).click();
  await expect(firstRange).not.toHaveText(normal ?? '');
  const crit = await firstRange.textContent();

  // Helping Hand only appears in doubles.
  await expect(page.getByText('Refuerzo', { exact: true })).toHaveCount(0);
  await page
    .getByRole('group', { name: 'Modo' })
    .getByRole('radio', { name: 'Dobles' })
    .check({ force: true });
  await page.getByText('Refuerzo', { exact: true }).click();
  await expect(firstRange).not.toHaveText(crit ?? '');
});
