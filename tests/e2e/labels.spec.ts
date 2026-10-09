import { expect, test, type Page } from '@playwright/test';

import { assertWebGl, waitForFrames } from './helpers.ts';

// EMI-234: scene labels never sit under a UI panel and do not jump sides.

type Box = { left: number; top: number; right: number; bottom: number };

const PANELS = [
  '.topbar',
  '#view-controls',
  '#body-card',
  '#time-controls',
  '#coach',
  'nav',
  '#bodies-drawer-open',
];

async function open(page: Page, path: string): Promise<void> {
  await page.goto('about:blank');
  await assertWebGl(page);
  await page.goto(path);
  await waitForFrames(page, 3);
}

async function overlaps(page: Page): Promise<string[]> {
  return page.evaluate((selectors) => {
    const boxes: { name: string; box: Box }[] = [];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (
          (element as HTMLElement).hidden ||
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          rect.width === 0 ||
          rect.height === 0
        ) {
          continue;
        }
        boxes.push({ name: selector, box: rect });
      }
    }
    const found: string[] = [];
    for (const label of document.querySelectorAll<HTMLElement>(
      '[data-testid^="body-label-"]',
    )) {
      if (getComputedStyle(label).visibility === 'hidden') {
        continue;
      }
      const rect = label.getBoundingClientRect();
      for (const { name, box } of boxes) {
        if (
          rect.right > box.left &&
          rect.left < box.right &&
          rect.bottom > box.top &&
          rect.top < box.bottom
        ) {
          found.push(`${label.dataset['testid'] ?? '?'} under ${name}`);
        }
      }
    }
    return found;
  }, PANELS);
}

test.describe('labels and panels', () => {
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
    { width: 768, height: 1024 },
  ]) {
    test(`no visible label under a panel at ${viewport.width}×${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      // The training panel stays: it is one of the panels to avoid.
      await open(page, '/?debug=1&paused=1&quality=medium');
      // Labels re-lay out at 10 Hz; give them a few layouts.
      await page.waitForTimeout(400);
      expect(await overlaps(page)).toEqual([]);

      const saturn = page.getByRole('button', { name: /Saturn/ }).first();
      if (await saturn.isVisible()) {
        await saturn.click();
      } else {
        await page.locator('#bodies-drawer-open').click();
        await page
          .getByRole('button', { name: /Saturn/ })
          .first()
          .click();
      }
      await page.waitForFunction(
        () => window.__orbitka?.getSelectedId() === 'saturn',
      );
      // Camera flight 1.2 s, then a few layouts.
      await page.waitForTimeout(1800);
      expect(await overlaps(page)).toEqual([]);
    });
  }
});

test('labels do not flip sides while time runs', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('orbitka.coach.done', '1');
  });
  await open(page, '/?debug=1&days=9778');
  // Label widths settle once the fonts are in.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  const sides = new Map<string, string[]>();
  for (let sample = 0; sample < 25; sample += 1) {
    const current = await page.evaluate(() => {
      const result: Record<string, string> = {};
      for (const label of document.querySelectorAll<HTMLElement>(
        '[data-testid^="body-label-"][data-side]',
      )) {
        if (getComputedStyle(label).visibility !== 'hidden') {
          result[label.dataset['bodyId'] ?? '?'] = label.dataset['side'] ?? '';
        }
      }
      return result;
    });
    for (const [id, side] of Object.entries(current)) {
      const list = sides.get(id) ?? [];
      if (list[list.length - 1] !== side) {
        list.push(side);
      }
      sides.set(id, list);
    }
    await page.waitForTimeout(200);
  }

  const flips: string[] = [];
  for (const [id, list] of sides) {
    if (list.length - 1 > 1) {
      flips.push(`${id}: ${list.join(' → ')}`);
    }
  }
  expect(flips).toEqual([]);
});
