import { expect, test } from '@playwright/test';

test('an anonymous visitor only sees the name of contemporaries', async ({ page }) => {
  await page.goto('/tree/I1');
  const zoe = page.locator('app-person-card', { hasText: 'MARTIN Zoé' });
  await expect(zoe).toContainText('Contemporain');
  await expect(zoe).not.toContainText('1990');

  await zoe.getByRole('button', { name: /MARTIN Zoé/ }).click();
  await expect(page.getByRole('complementary')).toContainText('née il y a moins de 100 ans');
});

test('an anonymous visitor sees the details of people over 100 years old', async ({ page }) => {
  await page.goto('/tree/I1');
  await expect(page.locator('app-person-card.part-root')).toContainText('12 mars 1850');
});

test('searching by date does not expose contemporaries', async ({ page }) => {
  await page.goto('/search?bornFrom=1980');
  await expect(page.getByRole('heading', { name: '0 résultat(s)' })).toBeVisible();
});

test('the admin page is inaccessible and the login page offers the configured providers', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/tree/);
  await page.goto('/login');
  await expect(page.getByText('Aucun fournisseur d’identité n’est configuré.')).toBeVisible();
});
