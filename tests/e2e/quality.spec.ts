import { expect, test, type Page } from '@playwright/test';

import { assertWebGl, skipCoach, waitForFrames } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await skipCoach(page);
});

async function openApp(page: Page, query: string): Promise<void> {
  await page.goto('about:blank');
  await assertWebGl(page);
  await page.goto(`/?debug=1&days=0&paused=1${query}`);
  await page.waitForFunction(() => (window.__orbitka?.frameCount ?? 0) > 0);
}

function backdropFilter(page: Page): Promise<string> {
  return page
    .getByTestId('view-controls')
    .evaluate((element) => getComputedStyle(element).backdropFilter);
}

test('low level has no backdrop filter', async ({ page }) => {
  await openApp(page, '&quality=low');
  await waitForFrames(page, 2);

  await expect(page.locator('html')).toHaveAttribute('data-quality', 'low');
  expect(await backdropFilter(page)).toBe('none');
  const quality = await page.evaluate(() => window.__orbitka?.getQuality());
  expect(quality?.level).toBe('low');
  expect(quality?.source).toBe('param');
  expect(quality?.locked).toBe(true);
  expect(quality?.pixelRatio).toBeLessThanOrEqual(1);
  await expect(page.locator('[data-debug-line="quality"]')).toHaveText(
    'Quality: low (param, locked)',
  );
});

test('high and medium keep the glass blur', async ({ page }) => {
  for (const [level, blur] of [
    ['high', 'blur(18px)'],
    ['medium', 'blur(12px)'],
  ] as const) {
    await openApp(page, `&quality=${level}`);
    await expect(page.locator('html')).toHaveAttribute('data-quality', level);
    expect(await backdropFilter(page)).toContain(blur);
  }
});

test('a wrong quality parameter is ignored', async ({ page }) => {
  await openApp(page, '&quality=ultra');

  const quality = await page.evaluate(() => window.__orbitka?.getQuality());
  expect(quality?.level).toBe('high');
  expect(quality?.source).toBe('default');
  expect(quality?.locked).toBe(false);
});

test('the address locks the quality select', async ({ page }) => {
  await openApp(page, '&quality=medium');
  await page.getByRole('button', { name: 'Ustawienia widoku' }).click();

  await expect(page.getByLabel('Jakość grafiki')).toBeDisabled();
  await expect(page.getByText('Ustawione w adresie strony')).toBeVisible();
});

test('the manual level applies at once and is remembered', async ({ page }) => {
  await openApp(page, '');
  const toggle = page.getByRole('button', { name: 'Ustawienia widoku' });
  await toggle.click();
  await page.getByLabel('Jakość grafiki').selectOption({ label: 'Niska' });

  await expect(page.locator('html')).toHaveAttribute('data-quality', 'low');
  expect(await backdropFilter(page)).toBe('none');
  expect(
    (await page.evaluate(() => window.__orbitka?.getQuality()))?.pixelRatio,
  ).toBeLessThanOrEqual(1);

  await openApp(page, '');
  await expect(page.locator('html')).toHaveAttribute('data-quality', 'low');
  expect(
    (await page.evaluate(() => window.__orbitka?.getQuality()))?.source,
  ).toBe('override');

  await page.getByRole('button', { name: 'Ustawienia widoku' }).click();
  await page
    .getByLabel('Jakość grafiki')
    .selectOption({ label: 'Automatyczna' });
  await expect(page.locator('html')).toHaveAttribute('data-quality', 'high');
  expect(
    (await page.evaluate(() => window.__orbitka?.getQuality()))?.locked,
  ).toBe(false);
});

test('Esc closes the settings panel and returns the focus', async ({
  page,
}) => {
  await openApp(page, '');
  const toggle = page.getByRole('button', { name: 'Ustawienia widoku' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await page.getByLabel('Jakość grafiki').focus();
  await page.keyboard.press('Escape');

  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});

test('no console errors when the level changes in a camera flight', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  await openApp(page, '');
  await page.getByTestId('body-item-jupiter').click();
  await page.getByRole('button', { name: 'Ustawienia widoku' }).click();
  await page.getByLabel('Jakość grafiki').selectOption({ label: 'Niska' });
  await page.waitForFunction(
    () => window.__orbitka?.getCameraState().flightActive === 0,
  );
  await waitForFrames(page, 3);

  expect(errors).toEqual([]);
});
