import { expect, test, type Page } from '@playwright/test';

import { assertWebGl, skipCoach, waitForFrames } from './helpers.ts';

// Budgets from src/render/renderBudget.ts (ADR-010 point 8, EMI-216). Literals
// on purpose, because e2e imports nothing from src.
const DRAW_CALL_BUDGET = 28;
const POSTFX_DRAW_CALL_BUDGET = 16;
const TRIANGLE_BUDGET = 60_000;
// TEXTURE_MEMORY_BUDGET_MIB per level, and the resolution of the selected body.
const LEVELS = [
  { level: 'high', textureMiB: 48, detailed: '2k' },
  { level: 'medium', textureMiB: 24, detailed: '1k' },
  { level: 'low', textureMiB: 16, detailed: '1k' },
] as const;

test.beforeEach(async ({ page }) => {
  await skipCoach(page);
});

async function openApp(page: Page, level: string): Promise<void> {
  await page.goto('about:blank');
  await assertWebGl(page);
  await page.goto(`/?debug=1&days=0&paused=1&quality=${level}`);
  await page.waitForFunction(
    () => (window.__orbitka?.getBodyScreenPositions().length ?? 0) > 0,
  );
  // The budget counts the textures too: wait for all ten 512 versions.
  await page.waitForFunction(
    () =>
      Object.values(window.__orbitka?.getTextureState().bodies ?? {}).filter(
        (value) => value !== null,
      ).length === 10,
  );
  await waitForFrames(page, 3);
}

async function expectWithinBudget(
  page: Page,
  level: (typeof LEVELS)[number],
): Promise<{ drawCalls: number; triangles: number; textureMiB: number }> {
  const stats = await page.evaluate(() => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }
    return hook.getRenderStats();
  });

  expect(stats.drawCalls).toBeGreaterThan(0);
  expect(stats.drawCalls).toBeLessThanOrEqual(DRAW_CALL_BUDGET);
  expect(stats.postFxDrawCalls).toBeLessThanOrEqual(POSTFX_DRAW_CALL_BUDGET);
  expect(stats.triangles).toBeLessThanOrEqual(TRIANGLE_BUDGET);
  expect(stats.textureMiB).toBeLessThanOrEqual(level.textureMiB);
  // Debug axes are reported apart and have no limit.
  expect(stats.debugDrawCalls).toBeGreaterThan(0);
  const quality = await page.evaluate(() => window.__orbitka?.getQuality());
  expect(quality?.level).toBe(level.level);
  return stats;
}

// Measured start view (days=0, 1280×720): 22 draw calls on main before
// EMI-221, plus 1 for Saturn's ring (EMI-221), 1 for the stars and 1 for the
// Sun's glow (EMI-222).
// Textures add no draw calls (EMI-225).
const START_DRAW_CALLS = 25;

for (const level of LEVELS) {
  test(`start and saturn within budget at ${level.level}`, async ({ page }) => {
    await openApp(page, level.level);
    const start = await expectWithinBudget(page, level);
    expect(start.drawCalls).toBe(START_DRAW_CALLS);

    await page.getByTestId('body-item-saturn').click();
    await page.waitForFunction(
      (detailed) =>
        window.__orbitka?.getSelectedId() === 'saturn' &&
        window.__orbitka.getCameraState().flightActive === 0 &&
        window.__orbitka.getTextureState().bodies.saturn === detailed,
      level.detailed,
    );
    await waitForFrames(page, 3);
    await expectWithinBudget(page, level);
  });
}
