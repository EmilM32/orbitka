import { expect, test, type Page } from '@playwright/test';

import { bodies } from '../../src/data/bodies.ts';

import { assertWebGl, readCanvasContrast } from './helpers.ts';

const drawnBodies = bodies.filter(
  (body) =>
    body.type === 'star' || body.type === 'planet' || body.type === 'moon',
);

async function openApp(page: Page, path: string) {
  await page.goto('about:blank');
  await assertWebGl(page);
  await page.goto(path);
}

test('brak błędów w konsoli', async ({ page }) => {
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

test('canvas niepusty', async ({ page }) => {
  await openApp(page, '/');
  const canvas = page.locator('canvas');
  await canvas.waitFor();
  const box = await canvas.boundingBox();
  if (box === null || box.width <= 0 || box.height <= 0) {
    throw new Error('canvas nie ma rozmiaru');
  }

  const pixels = await readCanvasContrast(page, [], box.width, box.height);
  expect(pixels.width).toBeGreaterThan(0);
  expect(pixels.height).toBeGreaterThan(0);
  expect(pixels.differentFraction).toBeGreaterThanOrEqual(0.005);
});

test('Słońce i planety', async ({ page }) => {
  await openApp(page, '/?debug=1&days=0&paused=1');
  await page.waitForFunction(
    (count) => window.__orbitka?.getBodyScreenPositions().length === count,
    drawnBodies.length,
  );

  const positions = await page.evaluate(() => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('brak hooka debug');
    }
    return hook.getBodyScreenPositions();
  });

  expect(positions.map((position) => position.id)).toEqual(
    drawnBodies.map((body) => body.id),
  );

  const visibleBodies = positions.filter(
    (position) => position.type === 'star' || position.type === 'planet',
  );
  expect(visibleBodies).toHaveLength(
    drawnBodies.filter((body) => body.type === 'star' || body.type === 'planet')
      .length,
  );
  for (const position of visibleBodies) {
    expect(position.visible).toBe(true);
  }

  const box = await page.locator('canvas').boundingBox();
  if (box === null) {
    throw new Error('canvas nie ma rozmiaru');
  }

  const pixels = await readCanvasContrast(
    page,
    visibleBodies.map((position) => ({ x: position.x, y: position.y })),
    box.width,
    box.height,
  );
  expect(pixels.sampleDiffers).toEqual(visibleBodies.map(() => true));
});

test('hook tylko z debug', async ({ page }) => {
  await page.goto('/');
  await page.locator('canvas').waitFor();
  const hook = await page.evaluate(() => window.__orbitka);
  expect(hook).toBeUndefined();
});
