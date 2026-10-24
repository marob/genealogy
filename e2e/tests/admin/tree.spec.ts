import { expect, type Page, test } from '@playwright/test';

/** Distance entre le centre de la carte centrale et le centre de la zone d'affichage. */
async function distanceToCenter(page: Page): Promise<number> {
  const [card, view] = await Promise.all([
    page.locator('app-person-card.part-root').boundingBox(),
    page.locator('.viewport').boundingBox(),
  ]);
  return Math.hypot(
    card!.x + card!.width / 2 - (view!.x + view!.width / 2),
    card!.y + card!.height / 2 - (view!.y + view!.height / 2),
  );
}

test('affiche l’arbre depuis la racine et navigue entre les générations', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/tree\/I0$/);
  const root = page.locator('app-person-card.part-root');
  await expect(root).toContainText('MARTIN Pierre');
  // Date du calendrier républicain.
  await expect(root).toContainText('18 brumaire an VIII');

  // Recentrer sur le fils.
  await page.locator('app-person-card', { hasText: 'Émile Joseph' }).getByRole('button', { name: 'Centrer' }).click();
  await expect(page).toHaveURL(/\/tree\/I1$/);
  await expect(page.locator('app-person-card.part-root')).toContainText('MARTIN Émile Joseph');
  await expect(page.locator('app-person-card', { hasText: 'DUPRÉ Hélène' })).toContainText('entre 1854 et 1856');
  await expect(page.locator('app-person-card', { hasText: 'MARTIN François' })).toBeVisible();
});

test('ouvre la fiche détaillée sans décalage de date dû au fuseau horaire', async ({ page }) => {
  // Le navigateur de test est réglé sur UTC+14 (Pacific/Kiritimati).
  await page.goto('/tree/I1');
  await page
    .locator('app-person-card.part-root')
    .getByRole('button', { name: /MARTIN Émile Joseph/ })
    .click();
  const details = page.getByRole('complementary');
  await expect(details).toContainText('12 mars 1850');
  await expect(details.locator('.events li', { hasText: 'Mariage' })).toContainText('1 juin 1878');
  await expect(details).toContainText('Médaille du travail en 1910.');
});

test('recherche par nom sans accents et par lieu', async ({ page }) => {
  await page.goto('/search');
  await page.getByLabel('Nom et/ou prénom').fill('helene dupre');
  await page.getByRole('button', { name: 'Rechercher' }).click();
  await expect(page).toHaveURL(/q=helene/);
  await expect(page.getByRole('heading', { name: '1 résultat(s)' })).toBeVisible();
  await page.getByRole('link', { name: /DUPRÉ Hélène/ }).click();
  await expect(page).toHaveURL(/\/tree\/I2$/);
});

test('change la langue de l’interface depuis la page compte et préférences', async ({ page }) => {
  await page.goto('/tree');
  await page.getByRole('link', { name: 'Compte et préférences' }).click();
  await page.getByRole('combobox', { name: 'Langue' }).selectOption('es');
  await expect(page.getByRole('heading', { name: 'Cuenta y preferencias' })).toBeVisible();
  await page.reload();
  // Choix mémorisé.
  await expect(page.getByRole('heading', { name: 'Cuenta y preferencias' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Idioma' }).selectOption('fr');
});

test('ouvre la fiche d’un proche depuis une fiche en recentrant l’arbre', async ({ page }) => {
  await page.goto('/tree/I1');
  await page
    .locator('app-person-card.part-root')
    .getByRole('button', { name: /MARTIN Émile Joseph/ })
    .click();
  await page.getByRole('complementary').getByRole('button', { name: 'Hélène DUPRÉ' }).click();
  await expect(page).toHaveURL(/\/tree\/I2$/);
  await expect(page.locator('app-person-card.part-root')).toContainText('DUPRÉ Hélène');
  await expect(page.getByRole('complementary')).toContainText('DUPRÉ Hélène');
});

test('déplie tous les descendants depuis la racine', async ({ page }) => {
  await page.goto('/tree/I0');
  await expect(page.locator('app-person-card', { hasText: 'MARTIN François' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Déplier tous les descendants' }).click();
  await expect(page.locator('app-person-card', { hasText: 'MARTIN Jules' })).toBeVisible();
});

test('prépare une version imprimable de l’arbre', async ({ page }) => {
  await page.goto('/print');
  await page.getByLabel('Personne centrale').fill('emile');
  await page
    .getByRole('option')
    .getByRole('button', { name: /MARTIN Émile Joseph/ })
    .click();
  await expect(page).toHaveURL(/person=I1/);
  await expect(page.locator('app-person-card', { hasText: 'MARTIN Jules' })).toBeVisible();
  await expect(page.locator('app-person-card', { hasText: 'MARTIN Pierre' })).toBeVisible();

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.app-header')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Imprimer' })).toBeHidden();
  await expect(page.locator('.toggle').first()).toBeHidden();
  await expect(page.locator('app-person-card').first()).toHaveCSS('break-inside', 'avoid');
  await page.emulateMedia({ media: 'screen' });
});

test('imprime en PDF sur une page à la taille de l’arbre, ou sur papier découpé en pages', async ({ page }) => {
  await page.goto('/print?person=I1');
  // Par défaut, toute la lignée réellement disponible : Pierre au-dessus, François puis Jules en dessous.
  await expect(page.getByLabel('Générations d’ascendants')).toHaveValue('1');
  await expect(page.getByLabel('Générations de descendants')).toHaveValue('2');
  const pageRule = () =>
    page.evaluate(() =>
      [...document.head.querySelectorAll('style')].map((s) => s.textContent).find((t) => t.includes('@page')),
    );
  await expect.poll(pageRule).toMatch(/@page \{ size: \d+mm \d+mm;/);

  await page.getByLabel('Papier : découpage en plusieurs pages').check();
  await expect(page).toHaveURL(/mode=paper/);
  await expect(page.locator('section.sheet').first()).toBeVisible();
  await expect(page.locator('.sheet-label').first()).toContainText('Page 1/');
  await expect.poll(pageRule).toContain('size: A4 landscape');
  await page.getByLabel('Format du papier').selectOption('A3');
  await expect.poll(pageRule).toContain('size: A3 landscape');
  // Chaque page reçoit ses cartes, et le repère reste en bas de la page.
  const sheet = page.locator('section.sheet').first();
  await expect(sheet.locator('app-person-card').first()).toBeVisible();
  const [sheetBox, labelBox] = await Promise.all([sheet.boundingBox(), sheet.locator('.sheet-label').boundingBox()]);
  expect(Math.abs(sheetBox!.y + sheetBox!.height - (labelBox!.y + labelBox!.height))).toBeLessThan(40);
});

test('garde la personne centrale immobile quand on déplie toute l’ascendance', async ({ page }) => {
  await page.goto('/tree/I6');
  const root = page.locator('app-person-card.part-root');
  await expect(root).toContainText('MARTIN Jules');
  // La vue se centre d'abord sur la personne.
  await expect.poll(() => distanceToCenter(page)).toBeLessThan(2);
  const before = await root.boundingBox();
  await page.getByRole('button', { name: 'Déplier tous les ascendants' }).click();
  await expect(page.locator('app-person-card', { hasText: 'MARTIN Pierre' })).toHaveCount(1);
  const after = await root.boundingBox();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(2);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
});

test('centre la nouvelle personne quand on recentre depuis une ascendance dépliée', async ({ page }) => {
  await page.goto('/tree/I6');
  await page.getByRole('button', { name: 'Déplier tous les ascendants' }).click();
  await expect(page.locator('app-person-card', { hasText: 'MARTIN Pierre' })).toHaveCount(1);
  await page.locator('app-person-card', { hasText: 'MARTIN Pierre' }).locator('.focus').dispatchEvent('click');
  await expect(page).toHaveURL(/\/tree\/I0$/);
  await expect(page.locator('app-person-card.part-root')).toContainText('MARTIN Pierre');
  await expect.poll(() => distanceToCenter(page)).toBeLessThan(2);
});

test('recherche rapide dans l’en-tête : suggestion puis recentrage', async ({ page }) => {
  await page.goto('/tree/I0');
  const search = page.getByRole('combobox', { name: 'Recherche rapide d’une personne' });
  await search.fill('helene');
  await expect(page.getByRole('option', { name: /DUPRÉ Hélène/ })).toBeVisible();
  await search.press('Enter');
  await expect(page).toHaveURL(/\/tree\/I2$/);
  await expect(page.locator('app-person-card.part-root')).toContainText('DUPRÉ Hélène');
  await expect(search).toHaveValue('');
});

test.describe('sur mobile', () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test('affiche un en-tête compact et une recherche réduite à une icône', async ({ page }) => {
    await page.goto('/tree/I0');
    await expect(page.locator('.brand')).toBeHidden();
    const header = await page.locator('.app-header').boundingBox();
    expect(header!.height).toBeLessThan(60);

    const search = page.getByRole('combobox', { name: 'Recherche rapide d’une personne' });
    await expect(search).toBeHidden();
    await page.getByRole('button', { name: 'Ouvrir la recherche rapide' }).click();
    await expect(search).toBeFocused();
    await search.fill('helene');
    await page.getByRole('option', { name: /DUPRÉ Hélène/ }).click();
    await expect(page).toHaveURL(/\/tree\/I2$/);
    await expect(search).toBeHidden();
  });

  test('centre la carte centrale sous le trait qui descend des parents', async ({ page }) => {
    await page.goto('/tree/I3');
    const card = page.locator('app-person-card.part-root');
    await expect(card).toContainText('MARTIN François');
    const offset = await card.evaluate((element) => {
      const join = element.closest('table')!.querySelector(':scope > tbody > tr > td > .vertical-line')!;
      const [a, b] = [element.getBoundingClientRect(), join.getBoundingClientRect()];
      return Math.abs(a.left + a.width / 2 - (b.left + b.width / 2));
    });
    expect(offset).toBeLessThan(1);
  });
});

test.describe('sur petit écran à la souris', () => {
  test.use({ viewport: { width: 600, height: 800 } });

  test('ouvre la recherche au clic et la referme en cliquant sur l’arbre', async ({ page }) => {
    await page.goto('/tree/I0');
    const search = page.getByRole('combobox', { name: 'Recherche rapide d’une personne' });
    const toggle = page.getByRole('button', { name: 'Ouvrir la recherche rapide' });
    await toggle.click();
    await expect(search).toBeFocused();
    await search.fill('helene');
    await expect(page.getByRole('option')).toHaveCount(1);
    await page.mouse.click(300, 500);
    await expect(search).toBeHidden();
    await toggle.click();
    await expect(search).toHaveValue('');
  });
});
