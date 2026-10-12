import { expect, test, type Page } from '@playwright/test';

import { VIEWPORT } from './fixtures.ts';
import { assertWebGl, skipCoach } from './helpers.ts';

// EMI-242: page-wide keys and the list of shortcuts.

test.beforeEach(async ({ page }) => {
  await skipCoach(page);
});

test.use({ viewport: { width: VIEWPORT.width, height: VIEWPORT.height } });

async function openApp(page: Page, path = '/?debug=1&days=0'): Promise<void> {
  await page.goto('about:blank');
  await assertWebGl(page);
  await page.goto(path);
  await page.locator('canvas').waitFor();
  await page.waitForFunction(() => (window.__orbitka?.frameCount ?? 0) > 3);
  await expect(page.getByTestId('time-pause')).not.toHaveAttribute(
    'aria-disabled',
    'true',
  );
}

async function paused(page: Page): Promise<boolean> {
  return page.evaluate(() => window.__orbitka?.getClock().paused ?? false);
}

async function selectedId(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__orbitka?.getSelectedId() ?? null);
}

test('space pauses and resumes, 5 picks Jupiter, 0 picks the Sun', async ({
  page,
}) => {
  await openApp(page);
  expect(await paused(page)).toBe(false);
  await page.keyboard.press('Space');
  expect(await paused(page)).toBe(true);
  await page.keyboard.press('Space');
  expect(await paused(page)).toBe(false);

  await page.keyboard.press('5');
  await expect.poll(() => selectedId(page)).toBe('jupiter');
  await page.keyboard.press('0');
  await expect.poll(() => selectedId(page)).toBe('sun');
  await page.keyboard.press('1');
  await expect.poll(() => selectedId(page)).toBe('mercury');
  await page.keyboard.press('8');
  await expect.poll(() => selectedId(page)).toBe('neptune');
  // 9 is not a body.
  await page.keyboard.press('9');
  expect(await selectedId(page)).toBe('neptune');
});

test('? opens the list, Esc closes it and returns the focus', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('time-reverse').focus();
  await page.keyboard.press('Shift+?');
  const dialog = page.getByRole('dialog', { name: 'Skróty klawiszowe' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Spacja');
  await expect(dialog).toContainText('Pauza lub start czasu');
  await expect(dialog).toContainText('Wybierz planetę');
  await expect(page.getByTestId('shortcuts-confirm')).toBeFocused();

  // Under the dialog the keys do nothing.
  await page.keyboard.press('3');
  await page.keyboard.press('Space');
  expect(await selectedId(page)).toBeNull();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('time-reverse')).toBeFocused();
  // Esc did not send the camera to the system view or change anything else.
  expect(await selectedId(page)).toBeNull();
});

test('the settings menu opens the same list', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('view-settings').click();
  await page.getByTestId('view-shortcuts').click();
  const dialog = page.getByRole('dialog', { name: 'Skróty klawiszowe' });
  await expect(dialog).toBeVisible();
  await page.getByTestId('shortcuts-confirm').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('view-settings')).toBeFocused();
  // The scrim closes it as well.
  await page.getByTestId('view-settings').click();
  await page.getByTestId('view-shortcuts').click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
});

test('keys are left alone on a select, a slider and a focused button', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('view-settings').click();
  await page.getByTestId('view-quality').focus();
  await page.keyboard.press('5');
  await page.keyboard.press('Space');
  expect(await selectedId(page)).toBeNull();
  expect(await paused(page)).toBe(false);
  await page.keyboard.press('Escape');

  // Space on the slider does not pause.
  await page.getByTestId('time-slider').focus();
  await page.keyboard.press('Space');
  expect(await paused(page)).toBe(false);

  // Space on a focused button presses that button, not the pause shortcut.
  const reverse = page.getByTestId('time-reverse');
  await reverse.focus();
  await expect(reverse).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await expect(reverse).toHaveAttribute('aria-pressed', 'true');
  expect(await paused(page)).toBe(false);
});

test('modifiers leave the browser shortcuts alone', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Control+5');
  await page.keyboard.press('Alt+Space');
  await page.keyboard.press('Meta+d');
  expect(await selectedId(page)).toBeNull();
  expect(await paused(page)).toBe(false);
});

test('D returns to today', async ({ page }) => {
  await openApp(page, '/?debug=1&days=0&paused=1');
  const today = page.getByTestId('time-today');
  await expect(today).toBeVisible();
  await page.keyboard.press('d');
  await expect(today).toBeHidden();
  const year = await page.evaluate(() => new Date().getUTCFullYear());
  await expect(page.getByTestId('sim-date')).toContainText(String(year));
});

test('the canvas keys still work', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('5');
  await expect.poll(() => selectedId(page)).toBe('jupiter');
  await page.locator('canvas').focus();
  await page.keyboard.press('Escape');
  await expect.poll(() => selectedId(page)).toBeNull();
});
