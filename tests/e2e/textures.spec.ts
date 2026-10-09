import { expect, test, type Page } from '@playwright/test';

import { assertWebGl, skipCoach, waitForFrames } from './helpers.ts';

// TEXTURE_LIMITS from src/render/textureStore.ts (ADR-010 points 8 and 9).
// Literals on purpose, because e2e imports nothing from src.
const LEVELS = [
  { level: 'high', memoryMiB: 48, slots: 2, resolution: '2k' },
  { level: 'medium', memoryMiB: 24, slots: 2, resolution: '1k' },
  { level: 'low', memoryMiB: 16, slots: 1, resolution: '1k' },
] as const;
const TEXTURED_COUNT = 10;

test.beforeEach(async ({ page }) => {
  await skipCoach(page);
});

async function openApp(page: Page, level = 'high'): Promise<void> {
  await page.goto('about:blank');
  await assertWebGl(page);
  await page.goto(`/?debug=1&days=0&paused=1&quality=${level}`);
  await page.waitForFunction(() => (window.__orbitka?.frameCount ?? 0) > 0);
}

async function select(
  page: Page,
  id: string,
  resolution: '1k' | '2k',
): Promise<void> {
  await page.getByTestId(`body-item-${id}`).click();
  await page.waitForFunction(
    ([body, expected]) =>
      window.__orbitka?.getTextureState().bodies[body] === expected,
    [id, resolution] as const,
  );
}

for (const { level, memoryMiB, slots, resolution } of LEVELS) {
  test(`memory limit at ${level}`, async ({ page }) => {
    await openApp(page, level);
    // The base textures first, so the budget is checked with all of them.
    await page.waitForFunction(
      (count) =>
        Object.values(window.__orbitka?.getTextureState().bodies ?? {}).filter(
          (value) => value !== null,
        ).length === count,
      TEXTURED_COUNT,
    );

    for (const id of ['jupiter', 'saturn', 'mars']) {
      await select(page, id, resolution);
      await waitForFrames(page, 2);
      const stats = await page.evaluate(() => {
        const hook = window.__orbitka;
        if (!hook) {
          throw new Error('missing debug hook');
        }
        return {
          textureMiB: hook.getRenderStats().textureMiB,
          state: hook.getTextureState(),
        };
      });
      expect(stats.textureMiB).toBeLessThanOrEqual(memoryMiB);
      const detailed = Object.values(stats.state.bodies).filter(
        (value) => value === '1k' || value === '2k',
      );
      expect(detailed.length).toBeLessThanOrEqual(slots);
    }

    const mars = await page.evaluate(
      () => window.__orbitka?.getTextureState().bodies.mars,
    );
    expect(mars).toBe(resolution);
  });
}

test('falls back to color on load error', async ({ page }) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('console', (message) => {
    // Chromium reports every failed request as a console error of its own
    // ("Failed to load resource"); the app itself must not log errors.
    if (message.type() === 'error') {
      if (!message.text().startsWith('Failed to load resource')) {
        errors.push(message.text());
      }
    } else if (message.type() === 'warning') {
      warnings.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  await page.route('**/assets/textures/**', (route) =>
    route.fulfill({ status: 404 }),
  );

  await openApp(page);
  await page.waitForFunction(
    (count) => window.__orbitka?.getTextureState().failed.length === count,
    TEXTURED_COUNT,
  );
  await page.getByTestId('body-item-jupiter').click();
  await page.waitForFunction(
    (count) => window.__orbitka?.getTextureState().failed.length === count,
    TEXTURED_COUNT + 1,
  );
  const start = await page.evaluate(() => window.__orbitka?.frameCount ?? 0);
  await waitForFrames(page, 5);

  const state = await page.evaluate(() => window.__orbitka?.getTextureState());
  expect(Object.values(state?.bodies ?? {})).toEqual(
    Array.from({ length: TEXTURED_COUNT }, () => null),
  );
  expect(
    await page.evaluate(() => window.__orbitka?.frameCount ?? 0),
  ).toBeGreaterThan(start);
  expect(errors).toEqual([]);
  // One warning per file, never repeated.
  const textureWarnings = warnings.filter((text) =>
    text.startsWith('textureStore: failed to load'),
  );
  expect(textureWarnings).toHaveLength(TEXTURED_COUNT + 1);
  expect(new Set(textureWarnings).size).toBe(textureWarnings.length);
});

test('attribution is visible', async ({ page }) => {
  await openApp(page);
  await page.locator('#scale-why').click();
  const toggle = page.getByRole('button', { name: 'Źródła i licencje' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await toggle.click();

  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const sources = page.locator('#sources');
  await expect(sources.getByText('Solar System Scope')).toBeVisible();
  const license = sources.getByRole('link', { name: 'licencja CC BY 4.0' });
  await expect(license).toBeVisible();
  await expect(license).toHaveAttribute(
    'href',
    'https://creativecommons.org/licenses/by/4.0/',
  );
  await expect(
    sources.getByText('Zmiany: zmniejszone i skompresowane do JPG.', {
      exact: false,
    }),
  ).toBeVisible();
});
