import { expect, test } from '@playwright/test';

// EMI-236: the tab shows the app icon and the full title.
test('site icons load and the title is set before scripts run', async ({
  page,
  request,
}) => {
  await page.route('**/*.js', (route) => route.abort());
  await page.goto('/');
  await expect(page).toHaveTitle('Orbitka: Układ Słoneczny');

  const icons = await page
    .locator('link[rel="icon"], link[rel="apple-touch-icon"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(icons).toEqual(['/favicon.svg', '/apple-touch-icon.png']);
  for (const href of icons) {
    const response = await request.get(href ?? '');
    expect(response.status(), href ?? '').toBe(200);
  }
});
