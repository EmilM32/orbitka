import { expect, test, type Page } from '@playwright/test';

import { DRAWN_BODY_IDS, MOON_IDS, VIEWPORT } from './fixtures.ts';
import { assertWebGl, waitForPaintedFrame } from './helpers.ts';

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
  await waitForPaintedFrame(page, VIEWPORT.width, VIEWPORT.height);

  const first = await readPositions(page);
  const ids = first.map((position) => position.id);

  expect(first).toHaveLength(DRAWN_BODY_IDS.length);
  expect(ids).toEqual([...DRAWN_BODY_IDS]);
  for (const id of MOON_IDS) {
    expect(ids).toContain(id);
  }

  await page.waitForTimeout(500);
  const second = await readPositions(page);
  expect(second).toEqual(first);
});
