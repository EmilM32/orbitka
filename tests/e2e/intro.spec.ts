import { expect, test, type Page } from '@playwright/test';

import { VIEWPORT } from './fixtures.ts';
import { assertWebGl } from './helpers.ts';

// EMI-248: the first-visit intro. `?debug=1` has no intro (steady first frame
// for the other specs); `?debug=1&intro=1` turns it on. These specs keep the
// pilot training on, to check the intro does not count for it.

test.use({ viewport: { width: VIEWPORT.width, height: VIEWPORT.height } });

const INTRO = '/?debug=1&intro=1&days=0&paused=1';

async function openApp(page: Page, path: string): Promise<void> {
  await page.goto('about:blank');
  await assertWebGl(page);
  await page.goto(path);
  await page.locator('canvas').waitFor();
  await page.waitForFunction(() => (window.__orbitka?.frameCount ?? 0) > 1);
}

type Camera = { distance: number; distanceMax: number; flightActive: number };

async function camera(page: Page): Promise<Camera> {
  return page.evaluate(() => {
    const state = window.__orbitka?.getCameraState();
    if (state === undefined) {
      throw new Error('missing debug hook');
    }
    return {
      distance: state.distance,
      distanceMax: state.distanceMax,
      flightActive: state.flightActive,
    };
  });
}

async function hiddenPanels(page: Page): Promise<number> {
  return page.locator('.intro-hidden').count();
}

test('the camera flies down to the start view while the panels come in', async ({
  page,
}) => {
  await openApp(page, INTRO);
  await expect
    .poll(async () => (await camera(page)).flightActive, { timeout: 5000 })
    .toBe(1);
  const during = await camera(page);
  const start = during.distanceMax / 1.5;
  // Far away at the beginning, and the panels are not there yet.
  expect(during.distance).toBeGreaterThan(start * 1.05);
  expect(await hiddenPanels(page)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__orbitka?.getIntroState())).toEqual({
    played: true,
    active: true,
  });

  await expect
    .poll(async () => (await camera(page)).flightActive, { timeout: 15_000 })
    .toBe(0);
  const after = await camera(page);
  expect(Math.abs(after.distance - start)).toBeLessThanOrEqual(0.5);
  await expect.poll(() => hiddenPanels(page), { timeout: 5000 }).toBe(0);
  await expect(page.locator('#time-controls')).toBeVisible();
  expect(await page.evaluate(() => window.__orbitka?.getIntroState())).toEqual({
    played: true,
    active: false,
  });
  // Nothing was selected and the training did not count the flight.
  expect(
    await page.evaluate(() => window.__orbitka?.getSelectedId()),
  ).toBeNull();
  const goals = await page.evaluate(() => window.__orbitka?.getGoalStates());
  expect(goals?.[0]?.done).toEqual({
    rotate: false,
    zoom: false,
    select: false,
  });
  // The training comes in with the rest.
  await expect(page.locator('#coach')).toBeVisible();
});

test('any input ends the intro at once, in its final state', async ({
  page,
}) => {
  await openApp(page, INTRO);
  await expect
    .poll(async () => (await camera(page)).flightActive, { timeout: 5000 })
    .toBe(1);
  const startDistance = (await camera(page)).distanceMax / 1.5;
  // An empty spot of the scene: a tap on a body would select it.
  await page.mouse.move(1100, 560);
  await page.mouse.down();
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__orbitka?.getIntroState()))?.active,
      { timeout: 1000 },
    )
    .toBe(false);
  const after = await camera(page);
  expect(after.flightActive).toBe(0);
  expect(Math.abs(after.distance - startDistance)).toBeLessThanOrEqual(0.5);
  await expect.poll(() => hiddenPanels(page), { timeout: 2000 }).toBe(0);
});

test('a key, the wheel and a list pick end it too', async ({ page }) => {
  for (const act of [
    async () => page.keyboard.press('Tab'),
    async () => page.mouse.wheel(0, 100),
    async () => page.getByTestId('body-item-mars').click({ force: true }),
  ]) {
    await openApp(
      page,
      INTRO.replace('intro=1', 'intro=1&x=' + String(Math.random())),
    );
    await expect
      .poll(async () => (await camera(page)).flightActive, { timeout: 5000 })
      .toBe(1);
    await page.evaluate(() => {
      sessionStorage.clear();
    });
    await act();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.__orbitka?.getIntroState()))
            ?.active,
        { timeout: 1000 },
      )
      .toBe(false);
    await expect.poll(() => hiddenPanels(page), { timeout: 2000 }).toBe(0);
  }
});

test('the intro plays once per session', async ({ page }) => {
  await openApp(page, INTRO);
  await expect
    .poll(async () => (await camera(page)).flightActive, { timeout: 5000 })
    .toBe(1);
  // The same tab again: the session remembers it.
  await page.reload();
  await page.waitForFunction(() => (window.__orbitka?.frameCount ?? 0) > 1);
  expect(await page.evaluate(() => window.__orbitka?.getIntroState())).toEqual({
    played: false,
    active: false,
  });
  expect((await camera(page)).flightActive).toBe(0);
  expect(await hiddenPanels(page)).toBe(0);
});

test('plain ?debug=1 has no intro', async ({ page }) => {
  await openApp(page, '/?debug=1&days=0&paused=1');
  expect(await page.evaluate(() => window.__orbitka?.getIntroState())).toEqual({
    played: false,
    active: false,
  });
  expect(await hiddenPanels(page)).toBe(0);
});

test('with reduced motion there is no flight; the panels only fade in', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page, INTRO);
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__orbitka?.getIntroState()))?.played,
      { timeout: 5000 },
    )
    .toBe(true);
  const state = await camera(page);
  expect(state.flightActive).toBe(0);
  expect(
    Math.abs(state.distance - state.distanceMax / 1.5),
  ).toBeLessThanOrEqual(0.5);
  await expect.poll(() => hiddenPanels(page), { timeout: 3000 }).toBe(0);
});

test('a link with a body has no intro', async ({ page }) => {
  await openApp(page, '/?debug=1&intro=1&body=saturn&paused=1');
  expect(await page.evaluate(() => window.__orbitka?.getIntroState())).toEqual({
    played: false,
    active: false,
  });
  expect(await hiddenPanels(page)).toBe(0);
});
