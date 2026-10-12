import { expect, test, type Page } from '@playwright/test';

import { assertWebGl, skipCoach, waitForFrames } from './helpers.ts';

// EMI-263: the interior cutaway on the body card. No WebGL screenshot.

const DEBUG_PATH = '/?debug=1&days=0&paused=1';

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

async function open(page: Page, path: string): Promise<void> {
  await page.goto('about:blank');
  await assertWebGl(page);
  await page.goto(path);
  await page.waitForFunction(() => (window.__orbitka?.frameCount ?? 0) > 2);
}

async function waitForFlightEnd(page: Page): Promise<void> {
  await page.waitForFunction(
    () => window.__orbitka?.getCameraState().flightActive === 0,
  );
}

async function select(page: Page, id: string): Promise<void> {
  const item = page.getByTestId(`body-item-${id}`);
  if (!(await item.isVisible())) {
    await page.getByTestId('bodies-drawer-open').click();
  }
  await item.click();
  await waitForFlightEnd(page);
  await expect(page.getByTestId('body-card')).toBeVisible();
  await waitForFrames(page, 3);
}

test.beforeEach(async ({ page }) => {
  await skipCoach(page);
});

test('earth cutaway shows the layers and keeps them for Jupiter', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await open(page, DEBUG_PATH);
  await select(page, 'earth');
  const toggle = page.getByTestId('body-card-cutaway');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const legend = page.getByTestId('body-card-interior');
  await expect(legend).toBeVisible();
  await expect(legend).toContainText('Skorupa');
  await expect(legend).toContainText(
    'Grubości warstw na rysunku są powiększone',
  );

  const crust = page.getByTestId('interior-layer-crust');
  await crust.focus();
  await page.keyboard.press('Enter');
  await expect(crust).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await expect(crust).toHaveAttribute('aria-pressed', 'false');

  await select(page, 'jupiter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(legend).toContainText('Wodór gazowy');
  await expect(legend).toContainText('nie ma twardej powierzchni');
  await expect(legend).not.toContainText('Skorupa');
  expect(errors).toEqual([]);
});

test('a cutaway link opens the legend and the copied link keeps it', async ({
  page,
  context,
}) => {
  const errors = trackErrors(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page, `${DEBUG_PATH}&body=earth&cutaway=1`);
  await waitForFlightEnd(page);
  await expect(page.getByTestId('body-card')).toBeVisible();
  await expect(page.getByTestId('body-card-cutaway')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('body-card-interior')).toContainText('Skorupa');

  await page.getByTestId('view-settings').click();
  await page.getByTestId('view-copy-link').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const url = new URL(copied);
  expect(url.searchParams.get('body')).toBe('earth');
  expect(url.searchParams.get('cutaway')).toBe('1');
  expect(url.searchParams.get('paused')).toBe('1');
  expect(errors).toEqual([]);
});
