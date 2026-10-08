import { expect, test, type Page } from '@playwright/test';

import { VIEWPORT } from './fixtures.ts';
import { assertWebGl, skipCoach } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await skipCoach(page);
});

const DEBUG_START = '/?debug=1&days=0';

type ClockState = {
  days: number;
  speed: number;
  reversed: boolean;
  paused: boolean;
  presetId: string | null;
};

type ScenePosition = {
  x: number;
  y: number;
  z: number;
};

type FrameSnapshot = {
  days: number;
  earth: ScenePosition;
};

test.use({ viewport: { width: VIEWPORT.width, height: VIEWPORT.height } });

async function openApp(page: Page, path: string): Promise<void> {
  await page.goto('about:blank');
  await assertWebGl(page);
  await page.goto(path);
  await page.locator('canvas').waitFor();
}

async function readClock(page: Page): Promise<ClockState> {
  return page.evaluate(() => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }
    return hook.getClock();
  });
}

async function readEarth(page: Page): Promise<ScenePosition> {
  const position = await page.evaluate(() => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }
    return hook.getBodyScenePosition('earth');
  });
  if (position === null) {
    throw new Error('missing earth scene position');
  }
  return position;
}

function distance(left: ScenePosition, right: ScenePosition): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

// A busy runner can give the first window fewer frames than the second, so a
// raw Δdays over 1500 ms of wall time is not comparable. Divide by the frame
// time the loop is allowed to use: dt clamped to 0.1 s, the same cap as the
// render loop. The ratio of those rates is the speed ratio.
async function daysPerSimSecond(page: Page, windowMs: number): Promise<number> {
  return page.evaluate(async (durationMs) => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }

    const startDays = hook.getClock().days;
    const start = performance.now();
    let previous = start;
    let simulated = 0;

    while (performance.now() - start < durationMs) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
      const now = performance.now();
      simulated += Math.min(0.1, Math.max(0, (now - previous) / 1000));
      previous = now;
    }

    if (!(simulated > 0)) {
      throw new Error('no frames in the measurement window');
    }

    return (hook.getClock().days - startDays) / simulated;
  }, windowMs);
}

async function collectSnapshots(
  page: Page,
  count: number,
): Promise<FrameSnapshot[]> {
  return page.evaluate(async (needed) => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }

    const samples: FrameSnapshot[] = [];
    let lastFrame = -1;
    const started = performance.now();

    while (samples.length < needed) {
      if (performance.now() - started > 20_000) {
        throw new Error(
          `collected ${samples.length} frame snapshots, needed ${needed}`,
        );
      }

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });

      const frame = hook.frameCount;
      if (frame === lastFrame) {
        continue;
      }
      lastFrame = frame;

      const snapshot = hook.getFrameSnapshot();
      if (snapshot === null) {
        continue;
      }
      samples.push(snapshot);
    }

    return samples;
  }, count);
}

test('hook › shape', async ({ page }) => {
  await openApp(page, DEBUG_START);
  await page.waitForFunction(
    () => window.__orbitka?.getFrameSnapshot() != null,
  );

  const report = await page.evaluate(() => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }

    const clock = hook.getClock();
    clock.days = -999;
    clock.presetId = 'tampered';
    const clockAgain = hook.getClock();
    const earth = hook.getBodyScenePosition('earth');
    if (earth !== null) {
      earth.x = 12_345;
    }
    const earthAgain = hook.getBodyScenePosition('earth');

    return {
      clock,
      clockAgain,
      earth,
      earthAgain,
      unknown: hook.getBodyScenePosition('xyz'),
      snapshot: hook.getFrameSnapshot(),
      keys: Object.keys(hook),
      plainClock: Object.getPrototypeOf(clock) === Object.prototype,
    };
  });

  expect(typeof report.clock.days).toBe('number');
  expect(typeof report.clock.speed).toBe('number');
  expect(typeof report.clock.reversed).toBe('boolean');
  expect(typeof report.clock.paused).toBe('boolean');
  expect(
    report.clock.presetId === null || typeof report.clock.presetId === 'string',
  ).toBe(true);
  expect(report.clockAgain.days).not.toBe(-999);
  expect(report.clockAgain.presetId).not.toBe('tampered');
  expect(report.plainClock).toBe(true);
  expect(report.earth).not.toBeNull();
  expect(Number.isFinite(report.earth?.x)).toBe(true);
  expect(Number.isFinite(report.earth?.y)).toBe(true);
  expect(Number.isFinite(report.earth?.z)).toBe(true);
  expect(report.earthAgain?.x).not.toBe(12_345);
  expect(report.unknown).toBeNull();
  expect(report.snapshot).not.toBeNull();
  expect(Number.isFinite(report.snapshot?.days)).toBe(true);
  expect(Number.isFinite(report.snapshot?.earth.x)).toBe(true);
  // Camera keys from EMI-190 are a superset. Time keys must stay present.
  expect(report.keys).toEqual(
    expect.arrayContaining([
      'frameCount',
      'getBodyScenePosition',
      'getBodyScreenPositions',
      'getClock',
      'getFrameSnapshot',
      'getRenderStats',
    ]),
  );
});

test('pause stops movement', async ({ page }) => {
  await openApp(page, DEBUG_START);
  await page.getByTestId('time-preset-ten-days').click();

  const clicked = await readClock(page);
  expect(clicked.presetId).toBe('ten-days');
  expect(clicked.speed).toBe(10);

  await page.waitForFunction(
    () => (window.__orbitka?.getClock().days ?? 0) > 1,
    undefined,
    { timeout: 20_000 },
  );

  const p1 = await readEarth(page);
  await page.waitForFunction(
    (start) => {
      const position = window.__orbitka?.getBodyScenePosition('earth');
      if (!position) {
        return false;
      }
      const moved = Math.hypot(
        position.x - start.x,
        position.y - start.y,
        position.z - start.z,
      );
      return moved > 0.001;
    },
    p1,
    { timeout: 20_000 },
  );

  await page.getByTestId('time-pause').click();
  await page.waitForTimeout(500);
  const d1 = (await readClock(page)).days;
  const p2 = await readEarth(page);
  await page.waitForTimeout(1000);
  const after = await readClock(page);
  const p3 = await readEarth(page);

  expect(after.days).toBe(d1);
  expect(Math.abs(p3.x - p2.x)).toBeLessThan(1e-9);
  expect(Math.abs(p3.y - p2.y)).toBeLessThan(1e-9);
  expect(Math.abs(p3.z - p2.z)).toBeLessThan(1e-9);
  expect(after.paused).toBe(true);
  await expect(page.getByTestId('time-pause')).toHaveText('Start');
  expect(distance(p2, p1)).toBeGreaterThan(0.001);
});

test('resume', async ({ page }) => {
  await openApp(page, DEBUG_START);
  await page.getByTestId('time-pause').click();
  const paused = await readClock(page);
  expect(paused.paused).toBe(true);
  const d2 = paused.days;

  await page.getByTestId('time-pause').click();
  const resumed = await readClock(page);
  expect(resumed.paused).toBe(false);
  await expect(page.getByTestId('time-pause')).toHaveText('Pauza');
  await page.waitForFunction(
    (start) => (window.__orbitka?.getClock().days ?? 0) > start,
    d2,
    { timeout: 20_000 },
  );
});

test('speed change', async ({ page }) => {
  await openApp(page, DEBUG_START);
  await page.getByTestId('time-preset-day').click();
  const start = await readClock(page);
  expect(start.speed).toBe(1);
  const rateDay = await daysPerSimSecond(page, 1500);

  await page.getByTestId('time-preset-year').click();
  const year = await readClock(page);
  expect(year.speed).toBe(365.25);
  await expect(page.getByTestId('time-preset-year')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByTestId('time-preset-day')).toHaveAttribute(
    'aria-checked',
    'false',
  );

  const rateYear = await daysPerSimSecond(page, 1500);
  const ratio = rateYear / rateDay;
  expect(rateDay, `day rate ${rateDay}`).toBeGreaterThan(0);
  expect(
    ratio,
    `speed ratio ${ratio} (${rateYear} / ${rateDay})`,
  ).toBeGreaterThanOrEqual(200);
  expect(
    ratio,
    `speed ratio ${ratio} (${rateYear} / ${rateDay})`,
  ).toBeLessThanOrEqual(500);
});

test('reverse', async ({ page }) => {
  await openApp(page, DEBUG_START);
  await page.getByTestId('time-preset-ten-days').click();
  await page.waitForFunction(
    () => (window.__orbitka?.getClock().days ?? 0) > 2,
    undefined,
    { timeout: 20_000 },
  );

  const before = await collectSnapshots(page, 15);
  expect(before).toHaveLength(15);

  const atClick = await readClock(page);
  await page.getByTestId('time-reverse').click();
  const reversed = await readClock(page);
  expect(reversed.reversed).toBe(true);
  await expect(page.getByTestId('time-reverse')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.waitForFunction(
    (start) => (window.__orbitka?.getClock().days ?? 0) < start,
    atClick.days,
    { timeout: 20_000 },
  );

  const after = await collectSnapshots(page, 15);
  expect(after).toHaveLength(15);

  const pairs = after.flatMap((sample) => {
    const close = before.filter(
      (earlier) => Math.abs(sample.days - earlier.days) < 0.5,
    );
    return close.length === 0 ? [] : [{ sample, close }];
  });
  expect(
    pairs.length,
    `fewer than 3 snapshot pairs with |Δdays| < 0.5 (found ${pairs.length})`,
  ).toBeGreaterThanOrEqual(3);

  for (const pair of pairs) {
    for (const earlier of pair.close) {
      const deltaDays = Math.abs(pair.sample.days - earlier.days);
      expect(distance(pair.sample.earth, earlier.earth)).toBeLessThan(
        0.14 * deltaDays + 0.01,
      );
    }
  }
});

test('slider', async ({ page }) => {
  await openApp(page, DEBUG_START);
  const slider = page.getByTestId('time-slider');

  await slider.fill('438');
  const snapped = await readClock(page);
  expect(Math.abs(snapped.speed - 10)).toBeLessThanOrEqual(1e-9);
  await expect(page.getByTestId('time-preset-ten-days')).toHaveAttribute(
    'aria-checked',
    'true',
  );

  await slider.fill('439');
  const free = await readClock(page);
  expect(Math.abs(free.speed - 10.069)).toBeLessThanOrEqual(0.005);
  for (const testId of [
    'time-preset-day',
    'time-preset-ten-days',
    'time-preset-month',
    'time-preset-year',
  ]) {
    await expect(page.getByTestId(testId)).toHaveAttribute(
      'aria-checked',
      'false',
    );
  }
});

test('date', async ({ page }) => {
  await openApp(page, DEBUG_START);
  await expect(page.getByTestId('sim-date')).toContainText('01.01.2000');

  await page.getByTestId('time-preset-year').click();
  await page.waitForFunction(
    () => (window.__orbitka?.getClock().days ?? 0) >= 1,
    undefined,
    { timeout: 20_000 },
  );
  await page.getByTestId('time-pause').click();

  const date = await page.getByTestId('sim-date').innerText();
  expect(date).not.toContain('01.01.2000');
  const clock = await readClock(page);
  expect(clock.days).toBeGreaterThanOrEqual(1);
  expect(clock.paused).toBe(true);
});

test('no hook without debug', async ({ page }) => {
  for (const path of ['/', '/?days=0', '/?debug=0']) {
    await openApp(page, path);
    const hook = await page.evaluate(() => window.__orbitka);
    expect(hook).toBeUndefined();
  }
});

test('panel width is stable', async ({ page }) => {
  await openApp(page, DEBUG_START);
  const panel = page.locator('#time-controls');
  await expect(page.getByTestId('time-pause')).not.toHaveAttribute(
    'aria-disabled',
    'true',
  );
  const widths: number[] = [];
  const measure = async (): Promise<void> => {
    const box = await panel.boundingBox();
    widths.push(box?.width ?? Number.NaN);
  };
  await measure();
  await page.getByTestId('time-pause').click();
  await measure();
  await page.getByTestId('time-pause').click();
  await page.getByTestId('time-reverse').click();
  await measure();
  for (const id of ['day', 'ten-days', 'month', 'year']) {
    await page.getByTestId(`time-preset-${id}`).click();
    await measure();
  }
  await page.getByTestId('time-reverse').click();
  await measure();
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
});

test('status under the date', async ({ page }) => {
  await openApp(page, DEBUG_START);
  const status = page.locator('#sim-speed');
  await page.getByTestId('time-preset-day').click();
  await expect(status).toHaveText('1 dzień/s');
  await page.getByTestId('time-preset-year').click();
  await page.getByTestId('time-reverse').click();
  await expect(status).toHaveText('Wstecz · 1 rok/s');
  await page.getByTestId('time-pause').click();
  await expect(status).toHaveText('Pauza');
  await expect(page.getByTestId('time-reverse')).toHaveText('Wstecz');
});

test('two rows at 768', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openApp(page, DEBUG_START);
  const slider = await page.getByTestId('time-slider').boundingBox();
  const date = await page.getByTestId('sim-date').boundingBox();
  const panel = await page.locator('#time-controls').boundingBox();
  if (slider === null || date === null || panel === null) {
    throw new Error('slider, date or panel has no box');
  }
  expect(slider.y).toBeGreaterThan(date.y + date.height);
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(768);
  expect(panel.y + panel.height).toBeLessThanOrEqual(1024);

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect
    .poll(async () => {
      const s = await page.getByTestId('time-slider').boundingBox();
      const d = await page.getByTestId('sim-date').boundingBox();
      return s !== null && d !== null && s.y < d.y + d.height;
    })
    .toBe(true);
});

test('approximate chip for 2054', async ({ page }) => {
  // 4 October 2054 in days since J2000 (2000-01-01 12:00 UTC).
  const days = (Date.UTC(2054, 9, 4) - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
  await openApp(page, `/?debug=1&paused=1&days=${days}`);
  const chip = page.getByTestId('time-accuracy');
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText(/Pozycje przybliżone/u);
  await chip.focus();
  const tip = page.getByRole('tooltip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('1800–2050');

  await openApp(page, '/?debug=1&paused=1&days=9776');
  await expect(page.getByTestId('time-accuracy')).toBeHidden();
});
