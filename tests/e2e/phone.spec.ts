import { expect, test, type Locator } from '@playwright/test';

test.use({ hasTouch: true, isMobile: true, reducedMotion: 'reduce' });

// A clipped button can still pass toBeVisible() and even a tap on its sliver.
async function expectFullTarget(control: Locator): Promise<void> {
  await expect(control).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() =>
      control.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          ),
        );
      }),
    )
    .toBe(true);
}

for (const [width, height] of [
  [320, 568],
  [360, 640],
  [390, 844],
  [430, 932],
  [667, 375],
  [844, 390],
] as const) {
  test(`phone controls at ${width}×${height}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const drawer = page.getByTestId('bodies-drawer-open');
    const why = page.locator('#scale-why');
    await expect(page.locator('.coach-step:visible')).toHaveCount(1);
    await expectFullTarget(drawer);
    await expectFullTarget(why);
    await why.tap();
    await expect(page.locator('#scale-explanation')).toBeVisible();
    await page.locator('#scale-close').tap();
    await drawer.tap();
    await page.getByTestId('body-item-neptune').tap();
    const handle = page.getByTestId('body-card-handle');
    await expectFullTarget(handle);
    await handle.tap();
    const scroll = page.getByTestId('body-card-scroll');
    await expect
      .poll(() => scroll.evaluate((el) => el.clientHeight))
      .toBeGreaterThan(44);
    await page.getByTestId('body-card-system').tap();
    await expect(handle).toBeHidden();

    const tempo = page.getByTestId('time-tempo');
    await expectFullTarget(tempo);
    await tempo.tap();
    for (const id of ['day', 'ten-days', 'month', 'year']) {
      const preset = page.getByTestId(`time-preset-${id}`);
      await expectFullTarget(preset);
      await preset.tap();
      await expect(preset).toHaveAttribute('aria-checked', 'true');
    }
    await page.getByTestId('time-reverse').tap();
    await expect(tempo).toContainText('−1 rok/s');
    await tempo.tap();
    await expect(page.locator('#time-options')).toBeHidden();

    const view = page.getByRole('button', { name: 'Widok', exact: true });
    await view.tap();
    const gravity = page.getByTestId('view-gravity');
    await gravity.tap();
    await expect(gravity).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('view-shortcuts').tap();
    await expect(page.getByTestId('shortcuts-dialog')).toBeVisible();
    await page.getByTestId('shortcuts-dismiss').tap();
    await expect(view).toBeFocused();
  });
}

for (const motion of ['reduce', 'no-preference'] as const) {
  test(`rotating an open cutaway keeps the planet framed (${motion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?body=earth&paused=1');
    await page.getByTestId('body-card-handle').tap();
    await page.getByTestId('body-card-cutaway').tap();
    for (const size of [
      { width: 844, height: 390 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      await expect(page.locator('#card-title')).toHaveText('Ziemia');
      // The minimum 24px selection ring can hide a planet that shrank to a dot.
      await expect
        .poll(() =>
          page
            .locator('#selection-ring')
            .evaluate((el) => el.getBoundingClientRect().width),
        )
        .toBeGreaterThan(44);
      const lastLayer = page.locator('[data-layer]').last();
      await lastLayer.tap();
      await expect(lastLayer).toHaveAttribute('aria-pressed', 'true');
      await lastLayer.tap();
    }
    await page.getByTestId('body-card-system').tap();
    await expect(page.getByTestId('body-card')).toBeHidden();
  });
}

test('the date warning fits beside an open card and today restores the date', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/?date=2051-10-28&body=earth&paused=1');
  await expect(page.getByTestId('sim-date')).toHaveText('28 października 2051');
  await expectFullTarget(page.getByTestId('time-accuracy'));
  await expectFullTarget(page.getByTestId('body-card-handle'));
  await page.getByTestId('time-tempo').tap();
  await page.getByTestId('time-today').tap();
  await expect(page.getByTestId('time-accuracy')).toBeHidden();
  await page.getByTestId('time-tempo').tap();
  await expectFullTarget(page.getByTestId('body-card-handle'));
});
