import { expect, test, type Page } from '@playwright/test';

import { skipCoach } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await skipCoach(page);
});

// EMI-217: the style A foundation as the browser renders it: fonts, the scale
// chip size, the blue focus ring on selected controls and the UI scale on
// large screens.

const FOCUS_RGB = 'rgb(140, 200, 255)';

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

async function open(
  page: Page,
  size: { width: number; height: number },
): Promise<void> {
  await page.setViewportSize(size);
  await page.goto('/');
  await page.locator('#scale-notice').waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function rootFontSize(page: Page): Promise<string> {
  return page.evaluate(
    () => getComputedStyle(document.documentElement).fontSize,
  );
}

test('fonts, brand and scale chip', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page, { width: 1280, height: 720 });

  const fonts = await page.evaluate(() => ({
    inter: document.fonts.check('16px Inter'),
    display: document.fonts.check('700 20px "Space Grotesk"'),
    loaded: [...document.fonts]
      .filter((face) => face.status === 'loaded')
      .map((face) => `${face.family.replaceAll('"', '')} ${face.weight}`),
  }));
  expect(fonts.inter).toBe(true);
  expect(fonts.display).toBe(true);
  expect(fonts.loaded).toContain('Inter 400');
  expect(fonts.loaded).toContain('Space Grotesk 700');

  const brand = page.locator('.brand');
  await expect(brand).toBeVisible();
  await expect(brand).toHaveText('Orbitka');
  const brandBox = await brand.boundingBox();
  expect(brandBox?.x ?? Infinity).toBeLessThan(40);
  expect(brandBox?.y ?? Infinity).toBeLessThan(40);
  expect(
    await brand.evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain('Space Grotesk');

  for (const selector of ['#scale-badge', '#scale-why']) {
    const size = await page
      .locator(selector)
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(size, selector).toBeGreaterThanOrEqual(14);
  }
  await expect(page.locator('#scale-badge')).toHaveText('Skala uproszczona');
  await expect(page.locator('#scale-why')).toHaveAttribute(
    'aria-haspopup',
    'dialog',
  );
  await page.locator('#scale-why').click();
  await expect(page.locator('#scale-explanation')).toBeVisible();

  const surface = await page.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    font: getComputedStyle(document.body).fontFamily,
  }));
  expect(surface.background).toBe('rgb(5, 7, 13)');
  expect(surface.font).toContain('Inter');
  expect(errors).toEqual([]);
});

test('focus ring is blue on pressed controls', async ({ page }) => {
  await open(page, { width: 1280, height: 720 });
  // Keyboard modality first, so script focus shows :focus-visible.
  await page.keyboard.press('Tab');

  const orbits = page.getByTestId('view-orbits');
  await expect(orbits).toHaveAttribute('aria-pressed', 'true');
  await orbits.focus();
  const jupiter = page.getByTestId('body-item-jupiter');
  await jupiter.focus();
  await page.keyboard.press('Enter');
  await expect(jupiter).toHaveAttribute('aria-pressed', 'true');
  await jupiter.focus();

  for (const control of [orbits, jupiter]) {
    await control.focus();
    const ring = await control.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        visible: element.matches(':focus-visible'),
        color: style.outlineColor,
        width: style.outlineWidth,
        offset: style.outlineOffset,
        style: style.outlineStyle,
        background: style.backgroundColor,
      };
    });
    expect(ring.visible).toBe(true);
    expect(ring.color).toBe(FOCUS_RGB);
    expect(ring.width).toBe('2px');
    expect(ring.offset).toBe('3px');
    expect(ring.style).toBe('solid');
    expect(ring.background).not.toMatch(/^rgba?\(255, 194, 75/u);
  }
});

test('UI scales from 1800x1000', async ({ page }) => {
  for (const [size, expected] of [
    [{ width: 1920, height: 1080 }, '19.2px'],
    [{ width: 1280, height: 720 }, '16px'],
    [{ width: 1920, height: 900 }, '16px'],
    [{ width: 1800, height: 999 }, '16px'],
  ] as const) {
    await open(page, size);
    expect(await rootFontSize(page), `${size.width}x${size.height}`).toBe(
      expected,
    );
  }
});
