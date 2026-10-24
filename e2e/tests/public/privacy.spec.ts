import { expect, test } from '@playwright/test';

test('un visiteur anonyme ne voit que le nom des contemporains', async ({ page }) => {
  await page.goto('/tree/I1');
  const zoe = page.locator('app-person-card', { hasText: 'MARTIN Zoé' });
  await expect(zoe).toContainText('Contemporain');
  await expect(zoe).not.toContainText('1990');

  await zoe.getByRole('button', { name: /MARTIN Zoé/ }).click();
  await expect(page.getByRole('complementary')).toContainText('née il y a moins de 100 ans');
});

test('un visiteur anonyme voit le détail des personnes de plus de 100 ans', async ({ page }) => {
  await page.goto('/tree/I1');
  await expect(page.locator('app-person-card.part-root')).toContainText('12 mars 1850');
});

test('la recherche par date n’expose pas les contemporains', async ({ page }) => {
  await page.goto('/search?bornFrom=1980');
  await expect(page.getByRole('heading', { name: '0 résultat(s)' })).toBeVisible();
});

test('l’administration est inaccessible et la connexion propose les fournisseurs configurés', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/tree/);
  await page.goto('/login');
  await expect(page.getByText('Aucun fournisseur d’identité n’est configuré.')).toBeVisible();
});
