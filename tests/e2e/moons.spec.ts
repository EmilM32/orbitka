import { expect, test, type Page } from '@playwright/test';

import {
  DRAWN_BODY_IDS,
  MIN_BRIGHT_FILL,
  MOON_IDS,
  VIEWPORT,
} from './fixtures.ts';
import {
  assertWebGl,
  expectPaintedFrame,
  skipCoach,
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

async function readPositions(page: Page): Promise<ScreenPosition[]> {
  return page.evaluate(() => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }
    return hook.getBodyScreenPositions();
  });
}

test('moons › hook contains moons', async ({ page }) => {
  await page.goto('about:blank');
  await assertWebGl(page);
  await page.goto('/?debug=1&days=0&paused=1');
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

  const first = await readPositions(page);
  const ids = first.map((position) => position.id);

  expect(first).toHaveLength(DRAWN_BODY_IDS.length);
  expect(ids).toEqual([...DRAWN_BODY_IDS]);
  for (const id of MOON_IDS) {
    expect(ids).toContain(id);
  }

  // The clock is paused, so 30 more frames must leave the moons in place.
  await waitForFrames(page, 30);
  const second = await readPositions(page);
  expect(second).toEqual(first);
});

test('jupiter moons are labelled when selected', async ({ page }) => {
  await page.goto('about:blank');
  await assertWebGl(page);
  // Day 3: no Galilean moon is behind Jupiter, so all four have labels.
  await page.goto('/?debug=1&days=3&paused=1');
  await waitForFrames(page, 3);
  const moons = ['io', 'europa', 'ganymede', 'callisto'];
  // System view: no moon labels.
  for (const id of moons) {
    await expect(page.getByTestId(`body-label-${id}`)).toHaveClass(
      /is-hidden/u,
    );
  }

  await page.getByTestId('body-item-jupiter').click();
  await page.waitForFunction(
    () =>
      window.__orbitka?.getSelectedId() === 'jupiter' &&
      window.__orbitka.getCameraState().flightActive === 0,
  );
  await waitForFrames(page, 3);
  for (const id of moons) {
    const label = page.getByTestId(`body-label-${id}`);
    await expect(label).not.toHaveClass(/is-hidden/u);
    expect(
      await label.evaluate((element) => getComputedStyle(element).fontSize),
    ).toBe('14px');
  }

  await page.getByTestId('view-reset').click();
  await waitForFrames(page, 3);
  for (const id of moons) {
    await expect(page.getByTestId(`body-label-${id}`)).toHaveClass(
      /is-hidden/u,
    );
  }
});
