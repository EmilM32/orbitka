import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';

import {
  assertWebGl,
  freeAreaCenter,
  skipCoach,
  waitForFrames,
} from './helpers.ts';

// EMI-224: the M4 student path in one go, the gate before M4 closes. Every
// test starts with clean storage, so "Trening pilota" shows unless a test
// marks it done.

// Copied, not imported: e2e imports nothing from src.
// SPEC §12 (NASA fact sheet) through src/content/locales/pl.json: Jupiter is
// about 11 Earths wide, its year is 11.86 years, its day 9 h 55.5 min.
const JUPITER_GAUGE = 'ok. 11 × Ziemia';
const JUPITER_YEAR = '11,9 roku';
const JUPITER_ROTATION = '9 h 56 min';
// ADR-010 point 8 (src/render/renderBudget.ts).
const DRAW_CALL_BUDGET = 28;
const TRIANGLE_BUDGET = 60_000;
// SPEC §5.6: the collapsed sheet, its gap to the time panel, the expanded
// height in portrait.
const SHEET_COLLAPSED_PX = 112;
const SHEET_GAP_PX = 12;
const SHEET_EXPANDED_DVH = 0.6;
// EMI-219: the selected body stands in the middle of the free area.
const CENTER_PX = 3;

// ?quality=medium is read once EMI-223 lands; until then the app ignores it.
// paused=1 keeps the selected body still for the centering checks.
const APP_PATH = '/?debug=1&quality=medium&paused=1';
// 4 October 2054 in days since J2000 (2000-01-01 12:00 UTC), outside the
// 1800–2050 range of the JPL elements (SPEC §5.9).
const DAYS_2054 =
  (Date.UTC(2054, 9, 4) - Date.UTC(2000, 0, 1, 12)) / 86_400_000;

const DESKTOP = { width: 1280, height: 720 };
const TABLET = { width: 768, height: 1024 };

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

// A failed run keeps a screenshot as an attachment for the PR and Linear.
test.afterEach(async ({ page }, testInfo: TestInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
    const path = testInfo.outputPath('failure.png');
    await page.screenshot({ path });
    await testInfo.attach('failure', { path, contentType: 'image/png' });
  }
});

async function open(page: Page, path: string): Promise<void> {
  await page.goto('about:blank');
  await assertWebGl(page);
  await page.goto(path);
  await page.waitForFunction(() => (window.__orbitka?.frameCount ?? 0) > 2);
}

// Flight over, then every finite CSS animation and transition finished (the
// card's 220 ms entry, the sheet's 420 ms, the list ↔ rail 220 ms).
async function waitForQuiet(page: Page): Promise<void> {
  await page.waitForFunction(
    () => window.__orbitka?.getCameraState().flightActive === 0,
  );
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const running = (): Animation[] =>
          document.getAnimations().filter((animation) => {
            const end = animation.effect?.getComputedTiming().endTime;
            return (
              animation.playState === 'running' &&
              typeof end === 'number' &&
              Number.isFinite(end)
            );
          });
        await Promise.all(
          running().map((animation) =>
            animation.finished.then(
              () => undefined,
              () => undefined,
            ),
          ),
        );
        return running().length;
      }),
    )
    .toBe(0);
  await waitForFrames(page, 2);
}

async function bodyOffCenter(page: Page, id: string): Promise<number> {
  const center = await freeAreaCenter(page);
  const point = await page.evaluate((target) => {
    const entry = window.__orbitka
      ?.getBodyScreenPositions()
      .find((body) => body.id === target);
    if (entry === undefined) {
      throw new Error(`missing ${target}`);
    }
    return { x: entry.x, y: entry.y };
  }, id);
  return Math.max(Math.abs(point.x - center.x), Math.abs(point.y - center.y));
}

async function viewInsets(
  page: Page,
): Promise<{ right: number; bottom: number }> {
  return page.evaluate(() => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }
    return hook.getViewInsets();
  });
}

// The value (dd) next to a fact name (dt) on the card.
function fact(card: Locator, name: string): Locator {
  return card
    .getByRole('term')
    .filter({ hasText: name })
    .locator('xpath=following-sibling::dd[1]');
}

async function studentPath(
  page: Page,
  options: { coachDone: boolean },
): Promise<void> {
  const errors = trackErrors(page);
  if (options.coachDone) {
    await skipCoach(page);
  }
  await page.setViewportSize(DESKTOP);
  await open(page, APP_PATH);

  // 1. "Trening pilota" with 0/3, or nothing after a finished training.
  const coach = page.getByRole('region', { name: 'Trening pilota' });
  if (options.coachDone) {
    await expect(page.getByRole('button', { name: 'Pomiń' })).toHaveCount(0);
    await expect(coach).toHaveCount(0);
  } else {
    await expect(coach).toBeVisible();
    await expect(coach).toContainText('0/3');
  }

  // 2. Jupiter from the list; "Wybierz planetę" counts.
  const list = page.getByRole('navigation', { name: 'Ciała niebieskie' });
  await list
    .getByRole('button', { name: 'Wybierz: Jowisz, gazowy olbrzym' })
    .click();
  if (!options.coachDone) {
    await expect(coach).toContainText('1/3');
    await expect(coach).toContainText('Wybierz planetę (zaliczone)');
  }
  await waitForQuiet(page);

  // 3. The card with its facts and a sourced fun fact.
  const card = page.getByRole('region', { name: 'Jowisz' });
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { level: 2 })).toHaveText('Jowisz');
  await expect(card).toContainText(JUPITER_GAUGE);
  await expect(fact(card, 'Rok trwa')).toHaveText(JUPITER_YEAR);
  await expect(fact(card, 'Obrót wokół osi')).toHaveText(JUPITER_ROTATION);
  const source = card.getByRole('link');
  await expect(source).toHaveCount(1);
  await expect(source).toHaveAttribute('href', /^https:\/\//u);

  // 4. Jupiter in the middle of the free area. SPEC §3: at ≤ 1440 px the
  // open card folds the list into the rail.
  await expect
    .poll(() => bodyOffCenter(page, 'jupiter'))
    .toBeLessThanOrEqual(CENTER_PX);
  const expand = list.getByRole('button', { name: 'Rozwiń listę ciał' });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');

  // 8. Render budget, in the busiest view of the path (Jupiter and moons).
  const stats = await page.evaluate(() => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }
    return hook.getRenderStats();
  });
  expect(stats.drawCalls).toBeGreaterThan(0);
  expect(stats.drawCalls).toBeLessThanOrEqual(DRAW_CALL_BUDGET);
  expect(stats.triangles).toBeLessThanOrEqual(TRIANGLE_BUDGET);

  // 5. Esc on the canvas: the card goes, the full list comes back.
  await page.locator('#viewport').focus();
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await waitForQuiet(page);
  await expect(
    list.getByRole('button', { name: 'Zwiń listę do paska' }),
  ).toHaveAttribute('aria-expanded', 'true');
  expect(await viewInsets(page)).toEqual({ right: 0, bottom: 0 });

  // 6. "Dlaczego?": four points, focus on "Rozumiem", Esc gives it back.
  const why = page.getByRole('button', {
    name: 'Pokaż wyjaśnienie, dlaczego skala jest uproszczona',
  });
  await expect(why).toHaveText('Dlaczego?');
  await why.click();
  const dialog = page.getByRole('dialog', {
    name: 'Dlaczego skala jest uproszczona?',
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('ol').getByRole('listitem')).toHaveCount(4);
  await expect(dialog.getByRole('button', { name: 'Rozumiem' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(why).toBeFocused();

  // 7. A date past 2050: the "Pozycje przybliżone" chip with its tooltip.
  await open(page, `${APP_PATH}&days=${DAYS_2054}`);
  const chip = page.getByRole('button', { name: /Pozycje przybliżone/u });
  await expect(chip).toBeVisible();
  await chip.focus();
  const tip = page.getByRole('tooltip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('1800–2050');

  // 9. No console errors over the whole path.
  expect(errors).toEqual([]);
}

test('student path', async ({ page }) => {
  // Two app starts and a 1.2 s flight in SwiftShader.
  test.setTimeout(60_000);
  await studentPath(page, { coachDone: false });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('student path (reduced motion)', async ({ page }) => {
    test.setTimeout(60_000);
    await studentPath(page, { coachDone: false });
  });
});

test('coach hidden after completion', async ({ page }) => {
  test.setTimeout(60_000);
  await studentPath(page, { coachDone: true });
});

test.describe('tablet', () => {
  test.use({ viewport: TABLET, hasTouch: true });

  test('tablet path', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = trackErrors(page);
    await open(page, APP_PATH);

    const planets = page.getByRole('button', { name: 'Planety' });
    await planets.tap();
    const drawer = page.getByTestId('bodies-drawer');
    await expect(drawer).toBeVisible();
    await drawer
      .getByRole('button', { name: 'Wybierz: Saturn, gazowy olbrzym' })
      .tap();
    await expect(drawer).toBeHidden();
    await expect(planets).toHaveAttribute('aria-expanded', 'false');
    await waitForQuiet(page);

    // Collapsed sheet: 112 px, 12 px above the time panel.
    const sheet = page.getByRole('region', { name: 'Saturn' });
    await expect(sheet).toBeVisible();
    const collapsed = await sheet.boundingBox();
    const time = await page.locator('#time-controls').boundingBox();
    if (collapsed === null || time === null) {
      throw new Error('sheet or time panel has no box');
    }
    expect(Math.abs(collapsed.height - SHEET_COLLAPSED_PX)).toBeLessThanOrEqual(
      1,
    );
    expect(
      Math.abs(time.y - (collapsed.y + collapsed.height) - SHEET_GAP_PX),
    ).toBeLessThanOrEqual(1);

    // A tap on the handle expands it, at most 60 dvh.
    const handle = sheet.getByRole('button', { name: 'Rozwiń kartę' });
    await handle.tap();
    await expect(
      sheet.getByRole('button', { name: 'Zwiń kartę' }),
    ).toHaveAttribute('aria-expanded', 'true');
    await waitForQuiet(page);
    const expanded = await sheet.boundingBox();
    if (expanded === null) {
      throw new Error('sheet has no box');
    }
    expect(expanded.height).toBeGreaterThan(collapsed.height);
    expect(expanded.height).toBeLessThanOrEqual(
      TABLET.height * SHEET_EXPANDED_DVH + 1,
    );

    await expect
      .poll(() => bodyOffCenter(page, 'saturn'))
      .toBeLessThanOrEqual(CENTER_PX);
    expect(errors).toEqual([]);
  });
});
