import { expect, test, type Page } from '@playwright/test';

import { VIEWPORT } from './fixtures.ts';
import { assertWebGl } from './helpers.ts';

// EMI-246: a link carries the body, the date and the speed. These specs do
// not mark the pilot training done: a link with a body skips it.

test.use({ viewport: { width: VIEWPORT.width, height: VIEWPORT.height } });

const LINK = 'body=saturn&date=2030-01-01&paused=1';

async function openApp(page: Page, path: string): Promise<void> {
  await page.goto('about:blank');
  await assertWebGl(page);
  await page.goto(path);
  await page.locator('canvas').waitFor();
  await page.waitForFunction(() => (window.__orbitka?.frameCount ?? 0) > 3);
}

async function selectedId(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__orbitka?.getSelectedId() ?? null);
}

test('a link opens in the view it describes', async ({ page }) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== 'localhost' && url.protocol.startsWith('http')) {
      outside.push(request.url());
    }
  });
  await openApp(page, `/?debug=1&${LINK}`);
  await expect.poll(() => selectedId(page)).toBe('saturn');
  await expect(page.getByTestId('sim-date')).toHaveText('1 stycznia 2030');
  await expect(page.getByTestId('body-card')).toBeVisible();
  await expect(page.locator('#body-card h2')).toHaveText('Saturn');
  const clock = await page.evaluate(() => window.__orbitka?.getClock());
  expect(clock?.paused).toBe(true);
  // The student who follows a teacher's link does not get the training.
  await expect(page.locator('#coach')).toHaveCount(0);
  expect(outside).toEqual([]);
});

test('a speed in the link starts the clock at that preset', async ({
  page,
}) => {
  await openApp(page, '/?debug=1&date=2030-01-01&speed=month');
  await expect(page.getByTestId('time-preset-month')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const clock = await page.evaluate(() => window.__orbitka?.getClock());
  expect(clock?.paused).toBe(false);
  expect(clock?.presetId).toBe('month');
  expect(await selectedId(page)).toBeNull();
});

test('unusable parameters are ignored', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await openApp(
    page,
    '/?debug=1&body=pluto&date=2030-02-31&speed=fast&paused=yes',
  );
  expect(await selectedId(page)).toBeNull();
  const clock = await page.evaluate(() => window.__orbitka?.getClock());
  expect(clock?.paused).toBe(false);
  expect(clock?.presetId).toBe('day');
  // Today, not 2030.
  const year = await page.evaluate(() => new Date().getUTCFullYear());
  await expect(page.getByTestId('sim-date')).toContainText(String(year));
  expect(errors).toEqual([]);
});

test('the debug days win over the date in the link', async ({ page }) => {
  await openApp(page, '/?debug=1&days=0&paused=1&date=2030-01-01');
  await expect(page.getByTestId('sim-date')).toHaveText('1 stycznia 2000');
});

test('copy link gives an address that restores the same view', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  await openApp(page, `/?debug=1&${LINK}`);
  await expect.poll(() => selectedId(page)).toBe('saturn');

  await page.getByTestId('view-settings').click();
  await page.getByTestId('view-copy-link').click();
  await expect(page.getByTestId('view-copy-status')).toHaveText(
    'Skopiowano link do tego widoku',
  );
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const url = new URL(copied);
  expect(url.hostname).toBe('localhost');
  expect(url.search).toBe(`?${LINK}`);
  // The address bar did not change while the app was used.
  expect(new URL(page.url()).search).toBe(`?debug=1&${LINK}`);

  const other = await context.newPage();
  await openApp(other, `${url.pathname}${url.search}&debug=1`);
  await expect.poll(() => selectedId(other)).toBe('saturn');
  await expect(other.getByTestId('sim-date')).toHaveText('1 stycznia 2030');
  const clock = await other.evaluate(() => window.__orbitka?.getClock());
  expect(clock?.paused).toBe(true);
  await context.close();
});

test('copy link says so when the clipboard refuses', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: () => Promise.reject(new Error('NotAllowedError')),
      },
      configurable: true,
    });
  });
  await openApp(page, '/?debug=1&paused=1&days=0');
  await page.getByTestId('view-settings').click();
  await page.getByTestId('view-copy-link').click();
  await expect(page.getByTestId('view-copy-status')).toHaveText(
    'Nie udało się skopiować linku. Skopiuj adres z paska przeglądarki.',
  );
});
