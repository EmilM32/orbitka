import { expect, test, type Page } from '@playwright/test';

import { assertWebGl } from './helpers.ts';

// EMI-201: "Trening pilota" on a first visit (each test starts with clean
// storage).

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  return errors;
}

async function open(page: Page): Promise<void> {
  await page.goto('about:blank');
  await assertWebGl(page);
  await page.goto('/?debug=1&days=0&paused=1');
  await page.waitForFunction(() => (window.__orbitka?.frameCount ?? 0) > 2);
}

type Box = { x: number; y: number; width: number; height: number };

function intersects(a: Box, b: Box): boolean {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0.5 && height > 0.5;
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).first().boundingBox();
  if (box === null) {
    throw new Error(`${selector} has no box`);
  }
  return box;
}

test('completes the training', async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page);

  const coach = page.getByRole('region', { name: 'Trening pilota' });
  await expect(coach).toBeVisible();
  const counter = coach.locator('.coach-counter');
  await expect(counter).toHaveText('0/3');
  await expect(counter).toHaveAttribute('aria-live', 'polite');
  const panel = await boxOf(page, '#coach');
  for (const other of [
    '#bodies-panel',
    '[data-testid="view-controls"]',
    '#time-controls',
    '#scale-notice',
  ]) {
    expect(intersects(panel, await boxOf(page, other)), other).toBe(false);
  }

  await page.locator('#viewport').focus();
  for (let press = 0; press < 3; press += 1) {
    await page.keyboard.press('ArrowRight');
  }
  await expect(counter).toHaveText('1/3');
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await expect(counter).toHaveText('2/3');
  await page.getByTestId('body-item-jupiter').click();

  const toast = page.getByRole('status').filter({ hasText: 'Gotowe!' });
  await expect(toast).toHaveText('Gotowe! Trening ukończony. Miłego lotu.');
  await expect(coach).toBeHidden();
  await expect(page.locator('#coach')).toHaveCount(0, { timeout: 6000 });

  await page.reload();
  await page.waitForFunction(() => (window.__orbitka?.frameCount ?? 0) > 2);
  await expect(page.locator('#coach')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('flights do not count as rotate or zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page);
  await page.getByTestId('body-item-saturn').click();
  await page.waitForFunction(
    () => window.__orbitka?.getCameraState().flightActive === 0,
  );
  await page.getByTestId('view-reset').click();
  await page.waitForFunction(
    () => window.__orbitka?.getCameraState().flightActive === 0,
  );
  await expect(page.locator('.coach-counter')).toHaveText('1/3');
  await expect(page.locator('[data-step="select"]')).toContainText(
    '(zaliczone)',
  );
  await expect(page.locator('[data-step="rotate"]')).toHaveAttribute(
    'aria-current',
    'step',
  );
});

test('skip and tab order', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page);
  await page.getByTestId('time-pause').focus();
  const after: string[] = [];
  for (let step = 0; step < 20; step += 1) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') ?? '',
    );
    if (id === 'coach-skip') {
      break;
    }
    after.push(id);
  }
  await expect(page.getByTestId('coach-skip')).toBeFocused();
  // Nothing after "Pomiń": the next Tab leaves the page content.
  await page.keyboard.press('Tab');
  const next = await page.evaluate(
    () => document.activeElement?.getAttribute('data-testid') ?? 'none',
  );
  expect(next).not.toMatch(/^(time-|view-|body-|bodies-)/u);
  expect(after.every((id) => !id.startsWith('coach'))).toBe(true);

  await page.getByTestId('coach-skip').click();
  await expect(page.locator('#coach')).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem('orbitka.coach.done')),
  ).toBe('1');
});

test('touch hints on tablet', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await open(page);
  const coach = page.getByRole('region', { name: 'Trening pilota' });
  await expect(coach).toContainText('rozsuń dwa palce');
  await expect(coach).toContainText('przeciągnij palcem');
  const panel = await boxOf(page, '#coach');
  const time = await boxOf(page, '#time-controls');
  expect(Math.abs(time.y - (panel.y + panel.height) - 12)).toBeLessThanOrEqual(
    1,
  );
  await context.close();
});
