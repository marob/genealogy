import { join } from 'node:path';
import { expect, test as setup } from '@playwright/test';

const fixture = join(import.meta.dirname, '../../backend/test/fixtures/famille-martin.ged');

setup('imports a GEDCOM file from the admin page', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Import GEDCOM' })).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  await page.getByRole('button', { name: 'Analyser' }).click();
  const preview = page.getByRole('region', { name: 'Aperçu' });
  await expect(preview).toContainText('famille-martin.ged');
  await expect(preview).toContainText('Heredis 2024');
  await expect(preview.locator('dd').first()).toHaveText('7');

  await preview.getByRole('button', { name: 'Appliquer' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('7 personnes');
  await dialog.getByRole('button', { name: 'Appliquer' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Import appliqué : 7 personnes.' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'En cours' })).toBeVisible();
});
