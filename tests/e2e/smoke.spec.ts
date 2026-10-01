import { expect, test, type Page } from '@playwright/test';

import {
  DRAWN_BODY_IDS,
  GOLDEN_SCREEN,
  MIN_FILL,
  VIEWPORT,
} from './fixtures.ts';
import { assertWebGl, waitForPaintedFrame } from './helpers.ts';

type ScreenPosition = {
  id: string;
  type: string;
  x: number;
  y: number;
  visible: boolean;
};

async function openApp(page: Page, path: string) {
  await page.goto('about:blank');
  await assertWebGl(page);
  await page.goto(path);
}

async function readPositions(page: Page): Promise<ScreenPosition[]> {
  return page.evaluate(() => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }
    return hook.getBodyScreenPositions();
  });
}

async function waitForBodies(page: Page) {
  await page.waitForFunction(
    (count) => window.__orbitka?.getBodyScreenPositions().length === count,
    DRAWN_BODY_IDS.length,
  );
  await waitForPaintedFrame(page, VIEWPORT.width, VIEWPORT.height);
}

test('no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  await openApp(page, '/');
  await page.locator('canvas').waitFor();
  await page.waitForTimeout(2000);
  expect(errors).toEqual([]);
});

test('canvas is not empty', async ({ page }) => {
  await openApp(page, '/');
  const canvas = page.locator('canvas');
  await canvas.waitFor();
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('canvas has no size');
  }

  expect(box.width).toBe(VIEWPORT.width);
  expect(box.height).toBe(VIEWPORT.height);

  const pixels = await waitForPaintedFrame(
    page,
    VIEWPORT.width,
    VIEWPORT.height,
  );
  expect(pixels.width).toBe(VIEWPORT.width);
  expect(pixels.height).toBe(VIEWPORT.height);
  expect(pixels.differentFraction).toBeGreaterThanOrEqual(MIN_FILL);
});

test('Sun and planets', async ({ page }) => {
  await openApp(page, '/?debug=1&days=0&paused=1');
  await waitForBodies(page);

  const positions = await readPositions(page);
  expect(positions.map((position) => position.id)).toEqual([...DRAWN_BODY_IDS]);

  for (const position of positions) {
    expect(position.visible).toBe(true);
    expect(Number.isFinite(position.x)).toBe(true);
    expect(Number.isFinite(position.y)).toBe(true);
  }

  const byId = new Map(positions.map((position) => [position.id, position]));
  const samples = (
    Object.keys(GOLDEN_SCREEN) as (keyof typeof GOLDEN_SCREEN)[]
  ).map((id) => {
    const position = byId.get(id);
    if (!position) {
      throw new Error(`missing position: ${id}`);
    }
    return { id, position, expected: GOLDEN_SCREEN[id] };
  });

  expect(byId.has('sun')).toBe(true);
  expect(samples).toHaveLength(3);
  for (const sample of samples) {
    expect(Math.abs(sample.position.x - sample.expected.x)).toBeLessThanOrEqual(
      1,
    );
    expect(Math.abs(sample.position.y - sample.expected.y)).toBeLessThanOrEqual(
      1,
    );
  }

  const distinct = new Set(
    samples.map(
      (sample) =>
        `${sample.position.x.toFixed(1)}:${sample.position.y.toFixed(1)}`,
    ),
  );
  expect(distinct.size).toBe(samples.length);

  const earthAtEpoch = byId.get('earth');
  if (!earthAtEpoch) {
    throw new Error('missing Earth');
  }

  await openApp(page, '/?debug=1&days=182.63&paused=1');
  await waitForBodies(page);
  const later = await readPositions(page);
  const earthLater = later.find((position) => position.id === 'earth');
  if (!earthLater) {
    throw new Error('missing Earth after half a year');
  }

  expect(Number.isFinite(earthLater.x)).toBe(true);
  expect(Number.isFinite(earthLater.y)).toBe(true);
  const moved = Math.hypot(
    earthLater.x - earthAtEpoch.x,
    earthLater.y - earthAtEpoch.y,
  );
  expect(moved).toBeGreaterThan(1);

  const box = await page.locator('canvas').boundingBox();
  expect(box?.width).toBe(VIEWPORT.width);
  expect(box?.height).toBe(VIEWPORT.height);
});

test('hook only with debug', async ({ page }) => {
  await page.goto('/');
  await page.locator('canvas').waitFor();
  const hook = await page.evaluate(() => window.__orbitka);
  expect(hook).toBeUndefined();
});
