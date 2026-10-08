import { expect, test, type Page } from '@playwright/test';

import {
  BODY_COLORS,
  DRAWN_BODY_IDS,
  GOLDEN_SCREEN,
  MIN_BRIGHT_FILL,
  PIXEL,
  UNPROBED_BODY_IDS,
  VIEWPORT,
} from './fixtures.ts';
import {
  assertWebGl,
  expectPaintedFrame,
  readCanvasPixels,
  skipCoach,
  waitForBrowserFrames,
  waitForFrames,
} from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await skipCoach(page);
});

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
  await waitForFrames(page, 3);
  await expectPaintedFrame(
    page,
    VIEWPORT.width,
    VIEWPORT.height,
    MIN_BRIGHT_FILL,
  );
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
  // About a second of running loop at 60 FPS, counted in frames, not time.
  await waitForBrowserFrames(page, 60);
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

  // No debug hook on this page, so the wait counts browser frames.
  await waitForBrowserFrames(page, 3);
  const pixels = await expectPaintedFrame(
    page,
    VIEWPORT.width,
    VIEWPORT.height,
    MIN_BRIGHT_FILL,
  );
  expect(pixels.width).toBe(VIEWPORT.width);
  expect(pixels.height).toBe(VIEWPORT.height);
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

  // Each body is drawn where the hook puts it: lit pixels in its own color
  // around the center. Fails when a body is missing from the scene, hidden,
  // transparent, black, or unlit.
  const probes = positions
    .filter((position) => !UNPROBED_BODY_IDS.includes(position.id))
    .map((position) => ({
      id: position.id,
      x: position.x,
      y: position.y,
      color: BODY_COLORS[position.id as keyof typeof BODY_COLORS],
    }));
  expect(probes.map((probe) => probe.id)).toEqual([
    'sun',
    'mercury',
    'venus',
    'earth',
    'mars',
    'jupiter',
    'saturn',
    'uranus',
    'neptune',
  ]);
  const pixels = await readCanvasPixels(page, probes);
  for (const probe of probes) {
    expect
      .soft(pixels.matches[probe.id] ?? 0, `${probe.id} pixels`)
      .toBeGreaterThanOrEqual(PIXEL.minMatches);
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

test('frame counter and render stats', async ({ page }) => {
  await openApp(page, '/?debug=1&days=0&paused=1');
  await waitForBodies(page);

  const before = await page.evaluate(() => window.__orbitka?.frameCount);
  expect(before).toBeGreaterThanOrEqual(3);
  await waitForFrames(page, 5);
  const after = await page.evaluate(() => window.__orbitka?.frameCount);
  expect(after).toBeGreaterThanOrEqual((before ?? 0) + 5);

  const stats = await page.evaluate(() => window.__orbitka?.getRenderStats());
  expect(Object.keys(stats ?? {}).sort()).toEqual([
    'debugDrawCalls',
    'drawCalls',
    'postFxDrawCalls',
    'textureMiB',
    'triangles',
  ]);
});

test('DRAW_CALL_BUDGET', async ({ page }) => {
  // DRAW_CALL_BUDGET from ADR-010 point 8: one limit for the scene without
  // debug objects. A literal on purpose, because e2e imports nothing from src.
  const DRAW_CALL_BUDGET = 28;
  const TRIANGLE_BUDGET = 60_000;

  await openApp(page, '/?debug=1&days=0&paused=1');
  await waitForBodies(page);
  const stats = await page.evaluate(() => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }
    return hook.getRenderStats();
  });

  expect(stats.drawCalls).toBeGreaterThan(0);
  expect(stats.drawCalls).toBeLessThanOrEqual(DRAW_CALL_BUDGET);
  // Debug axes are reported apart and have no limit.
  expect(stats.debugDrawCalls).toBeGreaterThan(0);
  expect(stats.triangles).toBeLessThanOrEqual(TRIANGLE_BUDGET);
});

test('hook only with debug', async ({ page }) => {
  await page.goto('/');
  await page.locator('canvas').waitFor();
  const hook = await page.evaluate(() => {
    const value = window.__orbitka;
    return {
      present: value !== undefined,
      getCameraState: typeof value?.getCameraState,
      getSelectedId: typeof value?.getSelectedId,
      getOrbitState: typeof value?.getOrbitState,
    };
  });
  expect(hook.present).toBe(false);
  expect(hook.getCameraState).toBe('undefined');
  expect(hook.getSelectedId).toBe('undefined');
  expect(hook.getOrbitState).toBe('undefined');
});
