import { expect, test as base, type Page } from '@playwright/test';

import {
  BODY_COLORS,
  DRAWN_BODY_IDS,
  PIXEL,
  START_DISTANCE,
  START_POLAR_DEG,
  VIEWPORT,
  ZOOM_MAX,
  ZOOM_MIN,
} from './fixtures.ts';
import {
  assertWebGl,
  freeAreaCenter,
  readCanvasPixels,
  skipCoach,
  waitForFrames,
} from './helpers.ts';

const DEBUG_PATH = '/?debug=1&days=0&paused=1';
const POLL_MS = 10_000;
const CENTER_PX = 3;

const PLANETS = [
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
] as const;

const SELECTABLE = ['sun', ...PLANETS] as const;

type CameraState = {
  azimuthDeg: number;
  polarDeg: number;
  distance: number;
  distanceMin: number;
  distanceMax: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  flightActive: number;
  flightKind: number;
  flightProgress: number;
  selectedRadius: number;
};

type ScreenPoint = { x: number; y: number; visible: boolean };

const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') {
          errors.push(message.text());
        }
      });
      page.on('pageerror', (error) => {
        errors.push(error.message);
      });
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

test.beforeEach(async ({ page }) => {
  await skipCoach(page);
});

test.describe.configure({ timeout: 120_000 });

async function openApp(page: Page, path = DEBUG_PATH): Promise<void> {
  await page.goto('about:blank');
  await assertWebGl(page);
  await page.goto(path);
}

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(
    (count) => window.__orbitka?.getBodyScreenPositions().length === count,
    DRAWN_BODY_IDS.length,
  );
  await waitForFrames(page, 3);
}

async function cameraState(page: Page): Promise<CameraState> {
  return page.evaluate(() => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }
    return hook.getCameraState();
  });
}

async function selectedId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }
    return hook.getSelectedId();
  });
}

async function screenPoint(page: Page, id: string): Promise<ScreenPoint> {
  return page.evaluate((bodyId) => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }
    const found = hook
      .getBodyScreenPositions()
      .find((item) => item.id === bodyId);
    if (found === undefined) {
      throw new Error(`missing screen position for ${bodyId}`);
    }
    return { x: found.x, y: found.y, visible: found.visible };
  }, id);
}

function requireVisible(point: ScreenPoint, id: string): void {
  if (!point.visible) {
    throw new Error(`${id} is not visible after the flight`);
  }
}

async function waitForFlightEnd(page: Page): Promise<CameraState> {
  await expect
    .poll(
      () =>
        page.evaluate(() => window.__orbitka?.getCameraState().flightActive),
      { timeout: POLL_MS },
    )
    .toBe(0);
  return cameraState(page);
}

async function waitUntilStable(
  page: Page,
  read: () => Promise<number>,
  epsilon: number,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const first = await read();
        await waitForFrames(page, 2);
        const second = await read();
        return Math.abs(first - second) < epsilon;
      },
      { timeout: POLL_MS },
    )
    .toBe(true);
}

async function waitForStableDistance(page: Page): Promise<CameraState> {
  await waitUntilStable(
    page,
    () =>
      page.evaluate(() => window.__orbitka?.getCameraState().distance ?? NaN),
    1e-6,
  );
  return cameraState(page);
}

function expectFinite(state: CameraState): void {
  for (const value of Object.values(state)) {
    expect(Number.isFinite(value)).toBe(true);
  }
}

// The body frame moves back when the card or the sheet covers part of the
// window (ADR-009 annex): max(W / (W - right), H / (H - bottom)).
async function freeAreaFactor(page: Page): Promise<number> {
  return page.evaluate(() => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }
    const insets = hook.getViewInsets();
    const width = window.innerWidth;
    const height = window.innerHeight;
    return Math.max(
      1,
      width / Math.max(1, width - insets.right),
      height / Math.max(1, height - insets.bottom),
    );
  });
}

async function expectBodyDistance(
  page: Page,
  state: CameraState,
  factor: number,
): Promise<void> {
  expect(state.selectedRadius).toBeGreaterThan(0);
  const area = await freeAreaFactor(page);
  expect(
    Math.abs(state.distance / (factor * area * state.selectedRadius) - 1),
  ).toBeLessThanOrEqual(0.01);
}

async function focusedName(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof Element)) {
      return null;
    }
    return active.getAttribute('data-testid') ?? active.id ?? null;
  });
}

async function tabUntil(page: Page, id: string): Promise<void> {
  await page.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
  });
  await tabTo(page, id);
}

async function tabTo(page: Page, id: string): Promise<void> {
  for (let step = 0; step < 40; step += 1) {
    if ((await focusedName(page)) === id) {
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`focus never reached ${id}, at ${await focusedName(page)}`);
}

async function expectStatus(page: Page, text: string): Promise<void> {
  await expect
    .poll(() => page.locator('[role="status"]').textContent(), {
      timeout: POLL_MS,
    })
    .toBe(text);
}

// Middle of the free area, not of the window: the card enters after 60 % of
// the flight and the frame follows it in 220 ms, so this polls.
async function expectCentered(page: Page, id: string): Promise<ScreenPoint> {
  let point: ScreenPoint = { x: Number.NaN, y: Number.NaN, visible: false };
  await expect
    .poll(
      async () => {
        point = await screenPoint(page, id);
        if (!point.visible) {
          return Number.POSITIVE_INFINITY;
        }
        const center = await freeAreaCenter(page);
        return Math.max(
          Math.abs(point.x - center.x),
          Math.abs(point.y - center.y),
        );
      },
      { timeout: POLL_MS },
    )
    .toBeLessThanOrEqual(CENTER_PX);
  requireVisible(point, id);
  return point;
}

async function flyTo(page: Page, id: string): Promise<CameraState> {
  await page.getByTestId(`body-item-${id}`).click();
  const state = await waitForFlightEnd(page);
  expect(await selectedId(page)).toBe(id);
  return state;
}

async function expectSystemView(page: Page, focusId: string): Promise<void> {
  const state = await waitForFlightEnd(page);
  expect(await selectedId(page)).toBeNull();
  expect(Math.abs(state.distance - START_DISTANCE)).toBeLessThanOrEqual(0.01);
  expect(Math.abs(state.polarDeg - START_POLAR_DEG)).toBeLessThanOrEqual(0.01);
  expect(state.flightActive).toBe(0);
  expect(await focusedName(page)).toBe(focusId);
  await expectStatus(page, 'Widok całego układu.');
}

async function emptyPoint(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }
    const positions = hook.getBodyScreenPositions();
    const width = window.innerWidth;
    const height = window.innerHeight;
    for (let y = 80; y < height - 180; y += 20) {
      for (let x = 260; x < width - 100; x += 20) {
        let clear = true;
        for (const position of positions) {
          if (!position.visible) {
            continue;
          }
          if (Math.hypot(position.x - x, position.y - y) < 48) {
            clear = false;
            break;
          }
        }
        if (clear) {
          return { x, y };
        }
      }
    }
    throw new Error('no empty point');
  });
}

async function wheelTimes(
  page: Page,
  deltaY: number,
  times: number,
): Promise<void> {
  for (let step = 0; step < times; step += 1) {
    await page.mouse.wheel(0, deltaY);
  }
}

test('camera hook reports the start view', async ({ page }) => {
  await openApp(page);
  await waitReady(page);

  const keys = await page.evaluate(() => Object.keys(window.__orbitka ?? {}));
  expect(keys).toEqual(
    expect.arrayContaining([
      'getBodyScreenPositions',
      'getCameraState',
      'getSelectedId',
      'getOrbitState',
      'getViewInsets',
    ]),
  );
  expect(keys).not.toContain('select');
  expect(keys).not.toContain('focusBody');

  const state = await cameraState(page);
  expectFinite(state);
  expect(Math.abs(state.distance - START_DISTANCE)).toBeLessThanOrEqual(0.01);
  expect(Math.abs(state.polarDeg - START_POLAR_DEG)).toBeLessThanOrEqual(0.01);
  expect(Math.abs(state.azimuthDeg)).toBeLessThanOrEqual(0.01);
  expect(state.flightActive).toBe(0);
  expect(await selectedId(page)).toBeNull();
});

test('debug hook exposes view insets', async ({ page }) => {
  await openApp(page);
  await waitReady(page);
  expect(
    await page.evaluate(() => window.__orbitka?.getViewInsets() ?? null),
  ).toEqual({ right: 0, bottom: 0 });
});

test('select Mars from the list flies to it', async ({ page }) => {
  await openApp(page);
  await waitReady(page);

  await page.getByTestId('body-item-mars').click();
  await expect(page.getByTestId('body-item-mars')).toHaveAttribute(
    'aria-current',
    'true',
  );
  expect(await selectedId(page)).toBe('mars');

  const state = await waitForFlightEnd(page);
  await expectBodyDistance(page, state, 6);
  await expectCentered(page, 'mars');
  expect(await focusedName(page)).toBe('body-item-mars');
  await expectStatus(page, 'Wybrano: Mars. Kamera przybliżona.');
});

test('camera tracks the moving planet', async ({ page }) => {
  await openApp(page);
  await waitReady(page);
  await flyTo(page, 'mars');

  await page.getByTestId('time-preset-year').click();
  await expectCenteredSamples(page);

  await page.getByTestId('time-reverse').click();
  await expectCenteredSamples(page);

  await page.getByTestId('time-pause').click();
  await expectCenteredSamples(page);
});

async function expectCenteredSamples(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        let worst = 0;
        const center = await freeAreaCenter(page);
        for (let sample = 0; sample < 5; sample += 1) {
          const point = await screenPoint(page, 'mars');
          if (!point.visible) {
            return CENTER_PX + 1;
          }
          worst = Math.max(
            worst,
            Math.hypot(point.x - center.x, point.y - center.y),
          );
          await waitForFrames(page, 1);
        }
        return worst;
      },
      { timeout: POLL_MS },
    )
    .toBeLessThanOrEqual(CENTER_PX);
}

test('click and drag on the canvas', async ({ page }) => {
  await openApp(page);
  await waitReady(page);

  const jupiter = await screenPoint(page, 'jupiter');
  requireVisible(jupiter, 'jupiter');
  await page.mouse.click(jupiter.x, jupiter.y);
  expect(await selectedId(page)).toBe('jupiter');
  await waitForFlightEnd(page);

  const onBody = await screenPoint(page, 'jupiter');
  requireVisible(onBody, 'jupiter');
  const beforeDrag = (await cameraState(page)).azimuthDeg;
  await page.mouse.move(onBody.x, onBody.y);
  await page.mouse.down();
  await page.mouse.move(onBody.x + 30, onBody.y, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(
      async () => Math.abs((await cameraState(page)).azimuthDeg - beforeDrag),
      {
        timeout: POLL_MS,
      },
    )
    .toBeGreaterThan(1);
  expect(await selectedId(page)).toBe('jupiter');

  await waitUntilStable(
    page,
    () =>
      page.evaluate(() => window.__orbitka?.getCameraState().azimuthDeg ?? NaN),
    1e-4,
  );
  const settled = await cameraState(page);
  const empty = await emptyPoint(page);
  await page.mouse.click(empty.x, empty.y);
  expect(await selectedId(page)).toBe('jupiter');
  const afterEmpty = await cameraState(page);
  expect(
    Math.abs(afterEmpty.azimuthDeg - settled.azimuthDeg),
  ).toBeLessThanOrEqual(0.01);
  expect(Math.abs(afterEmpty.distance - settled.distance)).toBeLessThanOrEqual(
    0.01,
  );

  const again = await screenPoint(page, 'jupiter');
  requireVisible(again, 'jupiter');
  await page.mouse.click(again.x, again.y);
  await waitForFrames(page, 3);
  expect((await cameraState(page)).flightActive).toBe(0);
  expect(await selectedId(page)).toBe('jupiter');
});

test('label click selects the body', async ({ page }) => {
  await openApp(page);
  await waitReady(page);

  const label = page.locator('[data-testid="body-label-saturn"]');
  await expect(label).toBeVisible({ timeout: POLL_MS });
  await label.click();
  expect(await selectedId(page)).toBe('saturn');
  await expect(page.getByTestId('body-item-saturn')).toHaveAttribute(
    'aria-current',
    'true',
  );
  await waitForFlightEnd(page);
});

test('two quick selects end on the last', async ({ page }) => {
  await openApp(page);
  await waitReady(page);

  await page.getByTestId('body-item-mars').click();
  await page.getByTestId('body-item-jupiter').click();

  await expect
    .poll(() => selectedId(page), { timeout: POLL_MS })
    .toBe('jupiter');
  const state = await waitForFlightEnd(page);
  expect(await selectedId(page)).toBe('jupiter');
  await expectBodyDistance(page, state, 6);
  expectFinite(state);
  await expectStatus(page, 'Wybrano: Jowisz. Kamera przybliżona.');
});

test('drag interrupts a flight', async ({ page }) => {
  await openApp(page);
  await waitReady(page);

  await page.getByTestId('body-item-mars').click();
  const during = await cameraState(page);
  expect(during.flightActive).toBe(1);
  expect(await selectedId(page)).toBe('mars');

  await page.mouse.move(480, 320);
  await page.mouse.down();
  await page.mouse.move(530, 320, { steps: 5 });
  await page.mouse.up();

  await expect
    .poll(
      () =>
        page.evaluate(() => window.__orbitka?.getCameraState().flightActive),
      { timeout: POLL_MS },
    )
    .toBe(0);
  expect(await selectedId(page)).toBe('mars');
});

test.describe('touch', () => {
  test.use({ hasTouch: true });

  test('second finger interrupts a flight', async ({ page }) => {
    await openApp(page);
    await waitReady(page);

    await page.getByTestId('body-item-mars').click();
    expect((await cameraState(page)).flightActive).toBe(1);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: 300, y: 300, id: 1 },
        { x: 600, y: 300, id: 2 },
      ],
    });
    // Both fingers rest without moving: no pinch zoom happens.
    await waitForFrames(page, 2);
    expect((await cameraState(page)).flightActive).toBe(0);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    expect(await selectedId(page)).toBe('mars');
  });
});

test('wheel zoom steps and limits', async ({ page }) => {
  await openApp(page);
  await waitReady(page);

  const start = await cameraState(page);
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  await page.mouse.wheel(0, -100);
  const stepped = await waitForStableDistance(page);
  expect(
    Math.abs(stepped.distance / (start.distance * 0.9) - 1),
  ).toBeLessThanOrEqual(0.01);

  await wheelTimes(page, -100, 60);
  const zoomedIn = await waitForStableDistance(page);
  expect(Math.abs(zoomedIn.distance - ZOOM_MIN)).toBeLessThanOrEqual(0.01);
  expect(Math.abs(zoomedIn.distanceMin - ZOOM_MIN)).toBeLessThanOrEqual(0.01);

  await wheelTimes(page, 100, 60);
  const zoomedOut = await waitForStableDistance(page);
  expect(Math.abs(zoomedOut.distance - ZOOM_MAX)).toBeLessThanOrEqual(0.01);
  expect(Math.abs(zoomedOut.distanceMax - ZOOM_MAX)).toBeLessThanOrEqual(0.01);

  await flyTo(page, 'mars');
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  await wheelTimes(page, 100, 60);
  const bodyFar = await waitForStableDistance(page);
  expect(Math.abs(bodyFar.distance - START_DISTANCE)).toBeLessThanOrEqual(0.01);
  expect(Math.abs(bodyFar.distanceMax - START_DISTANCE)).toBeLessThanOrEqual(
    0.01,
  );

  await wheelTimes(page, -100, 60);
  const bodyNear = await waitForStableDistance(page);
  expect(bodyNear.selectedRadius).toBeGreaterThan(0);
  expect(
    Math.abs(bodyNear.distance / (2.5 * bodyNear.selectedRadius) - 1),
  ).toBeLessThanOrEqual(0.01);
  expect(
    Math.abs(bodyNear.distanceMin / (2.5 * bodyNear.selectedRadius) - 1),
  ).toBeLessThanOrEqual(0.01);
});

test('polar stays within 10 and 170', async ({ page }) => {
  await openApp(page);
  await waitReady(page);

  const x = VIEWPORT.width / 2;
  await page.mouse.move(x, 200);
  await page.mouse.down();
  await page.mouse.move(x, 500, { steps: 20 });
  await page.mouse.up();
  await waitUntilStable(
    page,
    () =>
      page.evaluate(() => window.__orbitka?.getCameraState().polarDeg ?? NaN),
    1e-4,
  );
  const down = await cameraState(page);
  expect(down.polarDeg).toBeGreaterThanOrEqual(10);
  expect(down.polarDeg).toBeLessThanOrEqual(170);
  expect(Math.abs(down.polarDeg - 10)).toBeLessThanOrEqual(0.01);

  await page.mouse.move(x, 500);
  await page.mouse.down();
  await page.mouse.move(x, 80, { steps: 30 });
  await page.mouse.up();
  await waitUntilStable(
    page,
    () =>
      page.evaluate(() => window.__orbitka?.getCameraState().polarDeg ?? NaN),
    1e-4,
  );
  const up = await cameraState(page);
  expect(up.polarDeg).toBeGreaterThanOrEqual(10);
  expect(up.polarDeg).toBeLessThanOrEqual(170);
  expect(Math.abs(up.polarDeg - 170)).toBeLessThanOrEqual(0.01);
});

test('return with Esc', async ({ page }) => {
  await openApp(page);
  await waitReady(page);
  await flyTo(page, 'mars');
  await page.locator('#viewport').focus();
  await page.keyboard.press('Escape');
  await expectSystemView(page, 'body-item-mars');
});

test('return with Home', async ({ page }) => {
  await openApp(page);
  await waitReady(page);
  await flyTo(page, 'mars');
  await page.locator('#viewport').focus();
  await page.keyboard.press('Home');
  await expectSystemView(page, 'body-item-mars');
});

test('return with the view button', async ({ page }) => {
  await openApp(page);
  await waitReady(page);
  await flyTo(page, 'mars');
  await page.getByTestId('view-reset').click();
  await expectSystemView(page, 'body-item-mars');
});

test('keyboard only path on desktop', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await openApp(page);
  await waitReady(page);

  // One Tab stop for the list (roving tabindex), then the arrows.
  await tabUntil(page, 'body-item-sun');
  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press('ArrowDown');
  }
  expect(await focusedName(page)).toBe('body-item-mars');
  await page.keyboard.press('Enter');
  await waitForFlightEnd(page);
  expect(await selectedId(page)).toBe('mars');

  await tabTo(page, 'viewport');
  const before = await cameraState(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const turned = await cameraState(page);
  expect(
    Math.abs(turned.azimuthDeg - before.azimuthDeg - 10),
  ).toBeLessThanOrEqual(0.01);

  await page.keyboard.press('+');
  const zoomedIn = await cameraState(page);
  expect(
    Math.abs(zoomedIn.distance / (turned.distance * 0.9) - 1),
  ).toBeLessThanOrEqual(0.01);

  await page.keyboard.press('PageDown');
  const zoomedOut = await cameraState(page);
  expect(
    Math.abs(zoomedOut.distance / (zoomedIn.distance * 1.1) - 1),
  ).toBeLessThanOrEqual(0.01);

  await page.keyboard.press('Escape');
  await expectSystemView(page, 'body-item-mars');
});

test('Escape on list returns to system view', async ({ page }) => {
  await openApp(page);
  await waitReady(page);

  await flyTo(page, 'mars');
  await page.getByTestId('body-item-mars').focus();
  await page.keyboard.press('ArrowDown');
  expect(await focusedName(page)).toBe('body-item-jupiter');
  // In the rail the focused dot shows its name; the first Esc closes it.
  await expect(
    page.locator('.o-tooltip', { hasText: /^Jowisz$/u }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await selectedId(page)).toBe('mars');
  await page.keyboard.press('Escape');
  await expectSystemView(page, 'body-item-jupiter');
  await expect(page.locator('#bodies-panel')).not.toHaveClass(/is-rail/u);

  await flyTo(page, 'saturn');
  await page.getByTestId('body-item-saturn').focus();
  await page.keyboard.press('Home');
  await expectSystemView(page, 'body-item-saturn');
});

test('keyboard only path on tablet', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openApp(page);
  await waitReady(page);

  await tabUntil(page, 'bodies-drawer-open');
  await page.keyboard.press('Enter');
  expect(await focusedName(page)).toBe('body-item-sun');

  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press('ArrowDown');
  }
  expect(await focusedName(page)).toBe('body-item-mars');
  await page.keyboard.press('Enter');
  expect(await selectedId(page)).toBe('mars');
  expect(await focusedName(page)).toBe('bodies-drawer-open');
  await expect(page.locator('[data-testid="bodies-drawer"]')).toBeHidden();

  await tabTo(page, 'viewport');
  await page.keyboard.press('Escape');
  const state = await waitForFlightEnd(page);
  expect(await selectedId(page)).toBeNull();
  expect(state.flightActive).toBe(0);
  expect(await focusedName(page)).toBe('bodies-drawer-open');
});

test('Esc on tablet after a pick on the canvas focuses Planety', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openApp(page);
  await waitReady(page);

  // The drawer has no rail: no fold button there (SPEC §5.4).
  await page.getByTestId('bodies-drawer-open').click();
  await expect(page.getByTestId('bodies-collapse')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="bodies-drawer"]')).toBeHidden();

  const jupiter = await screenPoint(page, 'jupiter');
  requireVisible(jupiter, 'jupiter');
  await page.mouse.click(jupiter.x, jupiter.y);
  await expect.poll(() => selectedId(page)).toBe('jupiter');
  await page.locator('#viewport').focus();
  await page.keyboard.press('Escape');
  await expect.poll(() => selectedId(page)).toBeNull();
  expect(await focusedName(page)).toBe('bodies-drawer-open');
});

test('orbit emphasis and toggle', async ({ page }) => {
  await openApp(page);
  await waitReady(page);
  await flyTo(page, 'mars');

  const selected = await page.evaluate(() => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }
    return hook.getOrbitState();
  });
  expect(selected.visible).toBe(1);
  expect(selected.opacities).toHaveLength(PLANETS.length);
  for (let index = 0; index < selected.opacities.length; index += 1) {
    const expected = PLANETS[index] === 'mars' ? 0.8 : 0.35;
    expect(
      Math.abs((selected.opacities[index] ?? NaN) - expected),
    ).toBeLessThanOrEqual(0.001);
  }

  await page.getByTestId('view-reset').click();
  await waitForFlightEnd(page);
  const restored = await page.evaluate(() => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }
    return hook.getOrbitState();
  });
  for (const opacity of restored.opacities) {
    expect(Math.abs(opacity - 0.55)).toBeLessThanOrEqual(0.001);
  }

  await page.getByTestId('view-orbits').click();
  await expect(page.getByTestId('view-orbits')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  const hidden = await page.evaluate(() => window.__orbitka?.getOrbitState());
  expect(hidden?.visible).toBe(0);
  expect(
    await page.evaluate(() => localStorage.getItem('orbitka.orbits')),
  ).toBe('false');

  await page.reload();
  await waitReady(page);
  await expect(page.getByTestId('view-orbits')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  const afterReload = await page.evaluate(
    () => window.__orbitka?.getOrbitState().visible,
  );
  expect(afterReload).toBe(0);

  const earth = await screenPoint(page, 'earth');
  await page.getByTestId('time-preset-year').click();
  await expect
    .poll(
      async () => {
        const next = await screenPoint(page, 'earth');
        return Math.hypot(next.x - earth.x, next.y - earth.y);
      },
      { timeout: POLL_MS },
    )
    .toBeGreaterThan(1);
  await page.getByTestId('body-item-mars').click();
  expect(await selectedId(page)).toBe('mars');
});

test('every body can be selected and is drawn', async ({ page }) => {
  await openApp(page);
  await waitReady(page);

  for (const id of SELECTABLE) {
    await flyTo(page, id);
    const point = await expectCentered(page, id);
    const pixels = await readCanvasPixels(
      page,
      [{ id, x: point.x, y: point.y, color: BODY_COLORS[id] }],
      { ...PIXEL, windowRadius: 16 },
    );
    expect(pixels.matches[id] ?? 0).toBeGreaterThanOrEqual(1);
  }
});

test('reduced motion jumps without a flight', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  await waitReady(page);
  await page.evaluate(() => {
    document.documentElement.dataset['sawFlight'] = '0';
    const step = (): void => {
      const active = window.__orbitka?.getCameraState().flightActive ?? 0;
      if (active === 1) {
        document.documentElement.dataset['sawFlight'] = '1';
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  await page.getByTestId('body-item-mars').click();
  const state = await cameraState(page);
  expect(state.flightActive).toBe(0);
  expect(await selectedId(page)).toBe('mars');
  await expectBodyDistance(page, state, 6);
  await waitForFrames(page, 8);
  expect(
    await page.evaluate(() => document.documentElement.dataset['sawFlight']),
  ).toBe('0');
});

test('resize during a flight', async ({ page }) => {
  await openApp(page);
  await waitReady(page);

  await page.getByTestId('body-item-mars').click();
  expect((await cameraState(page)).flightActive).toBe(1);
  await page.setViewportSize({ width: 1100, height: 700 });

  const state = await waitForFlightEnd(page);
  expectFinite(state);
  expect(await selectedId(page)).toBe('mars');
  await expectBodyDistance(page, state, 6);
  await expectCentered(page, 'mars');
});

test('selection does not add draw calls', async ({ page }) => {
  // DRAW_CALL_BUDGET from ADR-010 point 8: scene without debug objects.
  const DRAW_CALL_BUDGET = 28;

  await openApp(page);
  await waitReady(page);
  const before = await page.evaluate(() => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }
    return hook.getRenderStats();
  });

  await flyTo(page, 'mars');
  await page.getByTestId('view-reset').click();
  await waitForFlightEnd(page);

  const after = await page.evaluate(() => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }
    return {
      stats: hook.getRenderStats(),
      frameCount: hook.frameCount,
    };
  });
  expect(after.stats.drawCalls).toBeLessThanOrEqual(DRAW_CALL_BUDGET);
  expect(after.stats.drawCalls).toBe(before.drawCalls);
  expect(Number.isFinite(after.stats.debugDrawCalls)).toBe(true);
  expect(after.stats.debugDrawCalls).toBeGreaterThanOrEqual(0);
  expect(Object.keys(after.stats).sort()).toEqual([
    'debugDrawCalls',
    'drawCalls',
    'triangles',
  ]);
  expect(Number.isFinite(after.frameCount)).toBe(true);
});
