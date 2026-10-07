import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type Locator, type Page } from '@playwright/test';

const DESKTOP_WIDE = { width: 1280, height: 800 };
const DESKTOP_EDGE = { width: 1025, height: 768 };
const TABLET_LANDSCAPE = { width: 1024, height: 768 };
const TABLET_PORTRAIT = { width: 768, height: 1024 };
const BELOW_TABLET = { width: 767, height: 1024 };

const OVERLAP_SIZES = [
  DESKTOP_WIDE,
  DESKTOP_EDGE,
  TABLET_LANDSCAPE,
  TABLET_PORTRAIT,
];

const TABLET_SIZES = [TABLET_LANDSCAPE, TABLET_PORTRAIT];

type Box = { x: number; y: number; width: number; height: number };

function intersects(a: Box, b: Box): boolean {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0.5 && height > 0.5;
}

function fits(box: Box, viewport: { width: number; height: number }): boolean {
  return (
    box.x >= -0.5 &&
    box.y >= -0.5 &&
    box.x + box.width <= viewport.width + 0.5 &&
    box.y + box.height <= viewport.height + 0.5
  );
}

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

async function settle(page: Page): Promise<void> {
  await page.locator('#scale-notice').waitFor();
  await page.locator('#time-controls').waitFor();
  await page.locator('[data-testid="view-controls"]').waitFor();
  await page.locator('#viewport').waitFor();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const panel = document.querySelector('#time-controls');
        const raw = getComputedStyle(document.documentElement)
          .getPropertyValue('--time-panel-height')
          .trim();
        if (panel === null) {
          return false;
        }
        const height = Math.ceil(panel.getBoundingClientRect().height);
        return raw === `${height}px`;
      }),
    )
    .toBe(true);
}

async function openAt(
  page: Page,
  size: { width: number; height: number },
  path = '/',
): Promise<string[]> {
  const errors = trackErrors(page);
  await page.setViewportSize(size);
  await page.goto(path);
  await settle(page);
  return errors;
}

async function boxOf(locator: Locator): Promise<Box | null> {
  if ((await locator.count()) === 0) {
    return null;
  }
  const target = locator.first();
  if (!(await target.isVisible())) {
    return null;
  }
  return target.boundingBox();
}

async function bodiesBox(page: Page): Promise<Box | null> {
  const panel = await boxOf(page.locator('#bodies-panel'));
  if (panel !== null) {
    return panel;
  }
  return boxOf(page.locator('[data-testid="bodies-drawer-open"]'));
}

async function assertNoHorizontalScroll(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
}

async function assertPairwise(
  boxes: Array<{ name: string; box: Box }>,
  viewport: { width: number; height: number },
): Promise<void> {
  for (const entry of boxes) {
    expect(fits(entry.box, viewport), `${entry.name} leaves the window`).toBe(
      true,
    );
  }
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left];
      const b = boxes[right];
      if (a === undefined || b === undefined) {
        continue;
      }
      expect(intersects(a.box, b.box), `${a.name} overlaps ${b.name}`).toBe(
        false,
      );
    }
  }
}

async function closedChrome(
  page: Page,
): Promise<Array<{ name: string; box: Box }>> {
  const scale = await boxOf(page.locator('#scale-notice'));
  const bodies = await bodiesBox(page);
  const view = await boxOf(page.locator('[data-testid="view-controls"]'));
  const time = await boxOf(page.locator('#time-controls'));
  const boxes = [
    { name: 'scale notice', box: scale },
    { name: 'bodies', box: bodies },
    { name: 'view', box: view },
    { name: 'time', box: time },
  ];
  const visible: Array<{ name: string; box: Box }> = [];
  for (const entry of boxes) {
    if (entry.box !== null) {
      visible.push({ name: entry.name, box: entry.box });
    }
  }
  expect(visible).toHaveLength(4);
  return visible;
}

async function focusId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active === null) {
      return '';
    }
    return active.getAttribute('data-testid') ?? active.id ?? active.tagName;
  });
}

test('no overlaps at 1280x800 / 1025x768 / 1024x768 / 768x1024', async ({
  page,
}) => {
  const errors = trackErrors(page);
  for (const size of OVERLAP_SIZES) {
    await page.setViewportSize(size);
    await page.goto('/');
    await settle(page);
    await assertNoHorizontalScroll(page);
    await assertPairwise(await closedChrome(page), size);
  }
  expect(errors).toEqual([]);
});

test('drawer open does not overlap at tablet sizes', async ({ page }) => {
  for (const size of TABLET_SIZES) {
    await page.setViewportSize(size);
    await page.goto('/');
    await settle(page);
    await page.getByTestId('bodies-drawer-open').click();
    await page.getByTestId('bodies-drawer').waitFor();
    await settle(page);
    const drawer = await boxOf(page.getByTestId('bodies-drawer'));
    const openButton = await boxOf(page.getByTestId('bodies-drawer-open'));
    const scale = await boxOf(page.locator('#scale-notice'));
    const view = await boxOf(page.locator('[data-testid="view-controls"]'));
    const time = await boxOf(page.locator('#time-controls'));
    const boxes = [
      { name: 'drawer', box: drawer },
      { name: 'open button', box: openButton },
      { name: 'scale notice', box: scale },
      { name: 'view', box: view },
      { name: 'time', box: time },
    ];
    const visible: Array<{ name: string; box: Box }> = [];
    for (const entry of boxes) {
      if (entry.box !== null) {
        visible.push({ name: entry.name, box: entry.box });
      }
    }
    expect(visible).toHaveLength(5);
    await assertPairwise(visible, size);
    await assertNoHorizontalScroll(page);
  }
});

test('view group sits 16px above time panel on tablet', async ({ page }) => {
  for (const size of TABLET_SIZES) {
    await page.setViewportSize(size);
    await page.goto('/');
    await settle(page);
    const time = await page.locator('#time-controls').boundingBox();
    const view = await page
      .locator('[data-testid="view-controls"]')
      .boundingBox();
    if (time === null || view === null) {
      throw new Error('time panel or view group has no box');
    }
    const gap = time.y - (view.y + view.height);
    expect(gap).toBeGreaterThanOrEqual(15);
    expect(gap).toBeLessThanOrEqual(17);
  }
});

test('touch targets', async ({ page }) => {
  await page.setViewportSize(DESKTOP_WIDE);
  await page.goto('/');
  await settle(page);
  await assertTouch(page, 32);

  await page.setViewportSize(TABLET_PORTRAIT);
  await settle(page);
  await page.getByTestId('bodies-drawer-open').click();
  await page.getByTestId('bodies-drawer').waitFor();
  await assertTouch(page, 44);
});

async function assertTouch(page: Page, minimum: number): Promise<void> {
  const buttons = page.locator('button');
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if (!(await button.isVisible())) {
      continue;
    }
    const box = await button.boundingBox();
    const label =
      (await button.getAttribute('data-testid')) ?? (await button.innerText());
    if (box === null) {
      throw new Error(`visible button ${label} has no box`);
    }
    expect(box.width, label).toBeGreaterThanOrEqual(minimum);
    expect(box.height, label).toBeGreaterThanOrEqual(minimum);
  }
}

test('tab order', async ({ page }) => {
  await page.setViewportSize(DESKTOP_WIDE);
  await page.goto('/');
  await settle(page);
  expect(await tabUntil(page, 'time-pause')).toEqual([
    'scale-why',
    'bodies-collapse',
    'body-item-sun',
    'body-item-mercury',
    'body-item-venus',
    'body-item-earth',
    'body-item-mars',
    'body-item-jupiter',
    'body-item-saturn',
    'body-item-uranus',
    'body-item-neptune',
    'viewport',
    'view-reset',
    'view-orbits',
    'view-zoom-in',
    'view-zoom-out',
    'time-pause',
  ]);

  await page.setViewportSize(TABLET_LANDSCAPE);
  await expect(page.getByTestId('bodies-drawer-open')).toBeVisible();
  await settle(page);
  expect(await tabUntil(page, 'time-pause')).toEqual([
    'scale-why',
    'bodies-drawer-open',
    'viewport',
    'view-reset',
    'view-orbits',
    'view-zoom-in',
    'view-zoom-out',
    'time-pause',
  ]);
});

async function tabUntil(page: Page, stopId: string): Promise<string[]> {
  // Focusing body makes the next Tab start at the first control. Blur keeps
  // the previous sequential position, and a viewport change after that Tab
  // walk does not emit resize or matchMedia events in Chromium.
  await page.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
  });
  const ids: string[] = [];
  for (let step = 0; step < 40; step += 1) {
    await page.keyboard.press('Tab');
    const id = await focusId(page);
    ids.push(id);
    if (id === stopId) {
      return ids;
    }
  }
  return ids;
}

test('debug overlay does not overlap list', async ({ page }) => {
  await page.setViewportSize(DESKTOP_WIDE);
  await page.goto('/?debug=1');
  await settle(page);
  await page.locator('#debug-overlay').waitFor();
  await assertDebugClear(page, DESKTOP_WIDE);

  await page.setViewportSize(TABLET_PORTRAIT);
  await settle(page);
  await assertDebugClear(page, TABLET_PORTRAIT);
});

async function assertDebugClear(
  page: Page,
  viewport: { width: number; height: number },
): Promise<void> {
  const overlay = await boxOf(page.locator('#debug-overlay'));
  const bodies = await bodiesBox(page);
  if (overlay === null || bodies === null) {
    throw new Error('debug overlay or bodies control has no box');
  }
  expect(fits(overlay, viewport)).toBe(true);
  expect(intersects(overlay, bodies)).toBe(false);
}

test('below 768 does not break', async ({ page }) => {
  const errors = await openAt(page, BELOW_TABLET);
  await assertNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('rotation keeps working', async ({ page }) => {
  const errors = await openAt(page, TABLET_PORTRAIT);
  await page.setViewportSize(TABLET_LANDSCAPE);
  await settle(page);
  await assertNoHorizontalScroll(page);
  await assertPairwise(await closedChrome(page), TABLET_LANDSCAPE);
  expect(errors).toEqual([]);
});

test('uses literal breakpoints', () => {
  const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const importLines = source
    .split('\n')
    .filter((line) => line.trimStart().startsWith('import '));
  expect(importLines.length).toBeGreaterThan(0);
  for (const line of importLines) {
    expect(line.includes('VIEW_CONFIG')).toBe(false);
    expect(line.includes('CAMERA_CONFIG')).toBe(false);
    expect(line.includes('/src/')).toBe(false);
    const source = line.split("from '")[1] ?? '';
    expect(
      source.startsWith('@playwright/test') ||
        source.startsWith('node:fs') ||
        source.startsWith('node:url'),
    ).toBe(true);
  }
  for (const token of ['1280', '800', '1025', '1024', '768', '767']) {
    expect(source.includes(token)).toBe(true);
  }
});
