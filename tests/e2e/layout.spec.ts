import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type Locator, type Page } from '@playwright/test';

// The training panel (EMI-201) has its own layout checks in coach.spec.ts.
// Inline, because this spec imports nothing but Playwright and node.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('orbitka.coach.done', '1');
  });
});

const DESKTOP_WIDE = { width: 1280, height: 800 };
const DESKTOP_EDGE = { width: 1025, height: 768 };
const TABLET_LANDSCAPE = { width: 1024, height: 768 };
const TABLET_PORTRAIT = { width: 768, height: 1024 };
const BELOW_TABLET = { width: 767, height: 1024 };

const OVERLAP_SIZES = [
  DESKTOP_WIDE,
  DESKTOP_EDGE,
  TABLET_LANDSCAPE,
  TABLET_PORTRAIT,
];

const TABLET_SIZES = [TABLET_LANDSCAPE, TABLET_PORTRAIT];

type Box = { x: number; y: number; width: number; height: number };

function intersects(a: Box, b: Box): boolean {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0.5 && height > 0.5;
}

function fits(box: Box, viewport: { width: number; height: number }): boolean {
  return (
    box.x >= -0.5 &&
    box.y >= -0.5 &&
    box.x + box.width <= viewport.width + 0.5 &&
    box.y + box.height <= viewport.height + 0.5
  );
}

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

async function settle(page: Page): Promise<void> {
  await page.locator('#scale-notice').waitFor();
  await page.locator('#time-controls').waitFor();
  await page.locator('[data-testid="view-controls"]').waitFor();
  await page.locator('#viewport').waitFor();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const panel = document.querySelector('#time-controls');
        const raw = getComputedStyle(document.documentElement)
          .getPropertyValue('--time-panel-height')
          .trim();
        if (panel === null) {
          return false;
        }
        const height = Math.ceil(panel.getBoundingClientRect().height);
        return raw === `${height}px`;
      }),
    )
    .toBe(true);
}

async function openAt(
  page: Page,
  size: { width: number; height: number },
  path = '/',
): Promise<string[]> {
  const errors = trackErrors(page);
  await page.setViewportSize(size);
  await page.goto(path);
  await settle(page);
  return errors;
}

async function boxOf(locator: Locator): Promise<Box | null> {
  if ((await locator.count()) === 0) {
    return null;
  }
  const target = locator.first();
  if (!(await target.isVisible())) {
    return null;
  }
  return target.boundingBox();
}

async function bodiesBox(page: Page): Promise<Box | null> {
  const panel = await boxOf(page.locator('#bodies-panel'));
  if (panel !== null) {
    return panel;
  }
  return boxOf(page.locator('[data-testid="bodies-drawer-open"]'));
}

async function assertNoHorizontalScroll(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
}

async function assertPairwise(
  boxes: Array<{ name: string; box: Box }>,
  viewport: { width: number; height: number },
): Promise<void> {
  for (const entry of boxes) {
    expect(fits(entry.box, viewport), `${entry.name} leaves the window`).toBe(
      true,
    );
  }
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left];
      const b = boxes[right];
      if (a === undefined || b === undefined) {
        continue;
      }
      expect(intersects(a.box, b.box), `${a.name} overlaps ${b.name}`).toBe(
        false,
      );
    }
  }
}

async function closedChrome(
  page: Page,
): Promise<Array<{ name: string; box: Box }>> {
  const scale = await boxOf(page.locator('#scale-notice'));
  const bodies = await bodiesBox(page);
  const view = await boxOf(page.locator('[data-testid="view-controls"]'));
  const time = await boxOf(page.locator('#time-controls'));
  const boxes = [
    { name: 'scale notice', box: scale },
    { name: 'bodies', box: bodies },
    { name: 'view', box: view },
    { name: 'time', box: time },
  ];
  const visible: Array<{ name: string; box: Box }> = [];
  for (const entry of boxes) {
    if (entry.box !== null) {
      visible.push({ name: entry.name, box: entry.box });
    }
  }
  expect(visible).toHaveLength(4);
  return visible;
}

async function focusId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active === null) {
      return '';
    }
    return active.getAttribute('data-testid') ?? active.id ?? active.tagName;
  });
}

test('no overlaps at 1280x800 / 1025x768 / 1024x768 / 768x1024', async ({
  page,
}) => {
  const errors = trackErrors(page);
  for (const size of OVERLAP_SIZES) {
    await page.setViewportSize(size);
    await page.goto('/');
    await settle(page);
    await assertNoHorizontalScroll(page);
    await assertPairwise(await closedChrome(page), size);
  }
  expect(errors).toEqual([]);
});

test('drawer open does not overlap at tablet sizes', async ({ page }) => {
  for (const size of TABLET_SIZES) {
    await page.setViewportSize(size);
    await page.goto('/');
    await settle(page);
    await page.getByTestId('bodies-drawer-open').click();
    await page.getByTestId('bodies-drawer').waitFor();
    await settle(page);
    const drawer = await boxOf(page.getByTestId('bodies-drawer'));
    const openButton = await boxOf(page.getByTestId('bodies-drawer-open'));
    const scale = await boxOf(page.locator('#scale-notice'));
    const view = await boxOf(page.locator('[data-testid="view-controls"]'));
    const time = await boxOf(page.locator('#time-controls'));
    const boxes = [
      { name: 'drawer', box: drawer },
      { name: 'open button', box: openButton },
      { name: 'scale notice', box: scale },
      { name: 'view', box: view },
      { name: 'time', box: time },
    ];
    const visible: Array<{ name: string; box: Box }> = [];
    for (const entry of boxes) {
      if (entry.box !== null) {
        visible.push({ name: entry.name, box: entry.box });
      }
    }
    expect(visible).toHaveLength(5);
    await assertPairwise(visible, size);
    await assertNoHorizontalScroll(page);
  }
});

test('drawer at tablet sizes', async ({ page }) => {
  for (const size of TABLET_SIZES) {
    await page.setViewportSize(size);
    await page.goto('/');
    await settle(page);
    const openButton = page.getByTestId('bodies-drawer-open');
    await expect(openButton).toHaveAttribute('aria-expanded', 'false');
    await openButton.click();
    const drawer = page.getByTestId('bodies-drawer');
    await expect(drawer).toBeVisible();
    await expect(openButton).toHaveAttribute('aria-expanded', 'true');
    // Pressed look: white 16 % (SPEC §5.2).
    await expect
      .poll(() =>
        openButton.evaluate((el) => getComputedStyle(el).backgroundColor),
      )
      .toBe('rgba(255, 255, 255, 0.16)');

    const box = await drawer.boundingBox();
    if (box === null) {
      throw new Error('drawer has no box');
    }
    expect(Math.abs(box.width - 300)).toBeLessThanOrEqual(1);
    await expect(
      drawer.getByRole('button', { name: 'Zamknij listę ciał' }),
    ).toHaveCount(1);
    await expect(drawer.getByTestId('bodies-collapse')).toHaveCount(0);

    // A tap on the scene, away from the drawer, closes it.
    await page.mouse.click(size.width - 40, size.height / 2);
    await expect(drawer).toBeHidden();
    await expect(openButton).toHaveAttribute('aria-expanded', 'false');

    await openButton.click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(openButton).toBeFocused();
  }
});

test('drawer stays open when the tablet turns', async ({ page }) => {
  await page.setViewportSize(TABLET_PORTRAIT);
  await page.goto('/');
  await settle(page);
  await page.getByTestId('bodies-drawer-open').click();
  const drawer = page.getByTestId('bodies-drawer');
  await expect(drawer).toBeVisible();

  await page.setViewportSize(TABLET_LANDSCAPE);
  await settle(page);
  await expect(drawer).toBeVisible();
  const box = await drawer.boundingBox();
  if (box === null) {
    throw new Error('drawer has no box');
  }
  expect(box.y + box.height).toBeLessThanOrEqual(TABLET_LANDSCAPE.height);
});

test('orbits label is visible on every breakpoint', async ({ page }) => {
  for (const size of [
    TABLET_PORTRAIT,
    TABLET_LANDSCAPE,
    DESKTOP_WIDE,
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await settle(page);
    const orbits = page.getByTestId('view-orbits');
    await expect(orbits.getByText('Orbity')).toBeVisible();
    await expect(orbits).toHaveAttribute('aria-pressed', 'true');
    // The switch is mint when on.
    await expect
      .poll(() =>
        orbits
          .locator('.o-toggle__switch')
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      )
      .toBe('rgb(116, 227, 181)');
  }
});

// The view group is one row in the top bar on every layout, so the body card
// and the bottom sheet never cover it (EMI-200).
test('view group sits in the top bar', async ({ page }) => {
  for (const size of [DESKTOP_WIDE, ...TABLET_SIZES]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await settle(page);
    const view = await page
      .locator('[data-testid="view-controls"]')
      .boundingBox();
    const scale = await page.locator('#scale-notice').boundingBox();
    if (view === null || scale === null) {
      throw new Error('view group or scale notice has no box');
    }
    expect(view.y).toBeGreaterThanOrEqual(0);
    expect(view.y + view.height).toBeLessThanOrEqual(60);
    expect(
      Math.abs(size.width - (view.x + view.width) - 16),
    ).toBeLessThanOrEqual(1);
    expect(intersects(view, scale)).toBe(false);
  }
});

test('touch targets', async ({ page }) => {
  await page.setViewportSize(DESKTOP_WIDE);
  await page.goto('/');
  await settle(page);
  await assertTouch(page, 32);

  await page.setViewportSize(TABLET_PORTRAIT);
  await settle(page);
  await page.getByTestId('bodies-drawer-open').click();
  await page.getByTestId('bodies-drawer').waitFor();
  await assertTouch(page, 44);
});

async function assertTouch(page: Page, minimum: number): Promise<void> {
  const buttons = page.locator('button');
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if (!(await button.isVisible())) {
      continue;
    }
    const box = await button.boundingBox();
    const label =
      (await button.getAttribute('data-testid')) ?? (await button.innerText());
    if (box === null) {
      throw new Error(`visible button ${label} has no box`);
    }
    expect(box.width, label).toBeGreaterThanOrEqual(minimum);
    expect(box.height, label).toBeGreaterThanOrEqual(minimum);
  }
}

test('tab order', async ({ page }) => {
  await page.setViewportSize(DESKTOP_WIDE);
  await page.goto('/');
  await settle(page);
  expect(await tabUntil(page, 'time-pause')).toEqual([
    'scale-why',
    'bodies-collapse',
    'bodies-au-info',
    // One Tab stop for the list; the arrows move inside it.
    'body-item-sun',
    'viewport',
    'view-reset',
    'view-orbits',
    'view-zoom-out',
    'view-zoom-in',
    'time-pause',
  ]);

  await page.setViewportSize(TABLET_LANDSCAPE);
  await expect(page.getByTestId('bodies-drawer-open')).toBeVisible();
  await settle(page);
  expect(await tabUntil(page, 'time-pause')).toEqual([
    'scale-why',
    'bodies-drawer-open',
    'viewport',
    'view-reset',
    'view-orbits',
    'view-zoom-out',
    'view-zoom-in',
    'time-pause',
  ]);
});

async function tabUntil(page: Page, stopId: string): Promise<string[]> {
  // Focusing body makes the next Tab start at the first control. Blur keeps
  // the previous sequential position, and a viewport change after that Tab
  // walk does not emit resize or matchMedia events in Chromium.
  await page.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
  });
  const ids: string[] = [];
  for (let step = 0; step < 40; step += 1) {
    await page.keyboard.press('Tab');
    const id = await focusId(page);
    ids.push(id);
    if (id === stopId) {
      return ids;
    }
  }
  return ids;
}

test('open scale explanation lies on top and fits at 1280x800 / 1280x720 / 1024x768 / 768x1024', async ({
  page,
}) => {
  for (const size of [
    DESKTOP_WIDE,
    { width: 1280, height: 720 },
    TABLET_LANDSCAPE,
    TABLET_PORTRAIT,
  ]) {
    const errors = await openAt(page, size);
    await page.locator('#scale-why').click();
    const dialog = page.locator('#scale-explanation');
    await expect(dialog).toBeVisible();

    // Wait for the 220 ms entry (fade and scale .98 → 1) to end.
    await expect
      .poll(() => dialog.evaluate((el) => getComputedStyle(el).opacity))
      .toBe('1');
    await page.waitForTimeout(250);
    const box = await boxOf(dialog);
    const close = await boxOf(page.locator('#scale-close'));
    if (box === null || close === null) {
      throw new Error('explanation or close has no box');
    }
    expect(
      fits(box, size),
      `explanation leaves ${size.width}x${size.height}`,
    ).toBe(true);
    expect(fits(close, size), 'close leaves the window').toBe(true);
    expect(close.y + close.height).toBeLessThanOrEqual(
      box.y + box.height + 0.5,
    );
    // Centered (SPEC §5.11).
    expect(
      Math.abs(box.x + box.width / 2 - size.width / 2),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(box.y + box.height / 2 - size.height / 2),
    ).toBeLessThanOrEqual(1);
    expect(box.width).toBeLessThanOrEqual(Math.min(580, size.width - 32) + 0.5);

    // Nothing (bodies list, Planety button, labels, time) is drawn over it.
    const covered = await page.evaluate(({ x, y, width, height }) => {
      const misses: string[] = [];
      for (let row = 0; row <= 4; row += 1) {
        for (let column = 0; column <= 4; column += 1) {
          // 8 px in from the edge, clear of the rounded corners.
          const px = x + 8 + ((width - 16) * column) / 4;
          const py = y + 8 + ((height - 16) * row) / 4;
          const hit = document.elementFromPoint(px, py);
          if (hit?.closest('#scale-explanation') == null) {
            misses.push(`${px},${py}: ${hit?.id ?? hit?.tagName ?? 'none'}`);
          }
        }
      }
      return misses;
    }, box);
    expect(covered).toEqual([]);
    const closeHit = await page.evaluate(
      ({ x, y, width, height }) =>
        document.elementFromPoint(x + width / 2, y + height / 2)?.id ?? '',
      close,
    );
    expect(closeHit).toBe('scale-close');

    await page.locator('#scale-close').click();
    await expect(dialog).toBeHidden();
    expect(errors).toEqual([]);
  }
});

test('why dialog traps focus', async ({ page }) => {
  const errors = await openAt(
    page,
    { width: 1280, height: 720 },
    '/?debug=1&days=0&paused=1',
  );
  const before = await page.evaluate(() => window.__orbitka?.getCameraState());
  const why = page.locator('#scale-why');
  await why.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#scale-close')).toBeFocused();

  for (let step = 0; step < 5; step += 1) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(
        () => document.activeElement?.closest('[role="dialog"]') != null,
      ),
    ).toBe(true);
  }
  // The rest of the page is inert while the dialog is open.
  await expect(page.locator('#viewport')).toHaveAttribute('inert', '');

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(why).toBeFocused();
  await expect(page.locator('#viewport')).not.toHaveAttribute('inert', '');
  // Esc closed the dialog only: the camera did not fly to the whole system.
  const after = await page.evaluate(() => window.__orbitka?.getCameraState());
  expect(after?.flightActive).toBe(0);
  expect(after?.distance).toBeCloseTo(before?.distance ?? 0, 6);
  expect(after?.azimuthDeg).toBeCloseTo(before?.azimuthDeg ?? 0, 6);
  expect(errors).toEqual([]);
});

test('why dialog fits at 1280x600', async ({ page }) => {
  const size = { width: 1280, height: 600 };
  await openAt(page, size);
  await page.locator('#scale-why').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(300);
  const box = await boxOf(dialog);
  if (box === null) {
    throw new Error('dialog has no box');
  }
  expect(fits(box, size)).toBe(true);
  await expect(page.locator('#scale-close')).toBeInViewport({ ratio: 1 });
  // The points scroll and get a Tab stop for the keyboard.
  const scrolls = await page
    .locator('.scale-explanation-body')
    .evaluate((el) => el.scrollHeight > el.clientHeight);
  if (scrolls) {
    await expect(page.locator('.scale-explanation-body')).toHaveAttribute(
      'tabindex',
      '0',
    );
  }
});

test('debug overlay does not overlap list', async ({ page }) => {
  await page.setViewportSize(DESKTOP_WIDE);
  await page.goto('/?debug=1');
  await settle(page);
  await page.locator('#debug-overlay').waitFor();
  await assertDebugClear(page, DESKTOP_WIDE);

  await page.setViewportSize(TABLET_PORTRAIT);
  await settle(page);
  await assertDebugClear(page, TABLET_PORTRAIT);
});

async function assertDebugClear(
  page: Page,
  viewport: { width: number; height: number },
): Promise<void> {
  const overlay = await boxOf(page.locator('#debug-overlay'));
  const bodies = await bodiesBox(page);
  if (overlay === null || bodies === null) {
    throw new Error('debug overlay or bodies control has no box');
  }
  expect(fits(overlay, viewport)).toBe(true);
  expect(intersects(overlay, bodies)).toBe(false);
}

test('below 768 does not break', async ({ page }) => {
  const errors = await openAt(page, BELOW_TABLET);
  await assertNoHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('rotation keeps working', async ({ page }) => {
  const errors = await openAt(page, TABLET_PORTRAIT);
  await page.setViewportSize(TABLET_LANDSCAPE);
  await settle(page);
  await assertNoHorizontalScroll(page);
  await assertPairwise(await closedChrome(page), TABLET_LANDSCAPE);
  expect(errors).toEqual([]);
});

test('uses literal breakpoints', () => {
  const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const importLines = source
    .split('\n')
    .filter((line) => line.trimStart().startsWith('import '));
  expect(importLines.length).toBeGreaterThan(0);
  for (const line of importLines) {
    expect(line.includes('VIEW_CONFIG')).toBe(false);
    expect(line.includes('CAMERA_CONFIG')).toBe(false);
    expect(line.includes('/src/')).toBe(false);
    const source = line.split("from '")[1] ?? '';
    expect(
      source.startsWith('@playwright/test') ||
        source.startsWith('node:fs') ||
        source.startsWith('node:url'),
    ).toBe(true);
  }
  for (const token of ['1280', '800', '1025', '1024', '768', '767']) {
    expect(source.includes(token)).toBe(true);
  }
});

async function assertPanelFits(page: Page): Promise<void> {
  // After the rail the width runs back to 252 px in 220 ms.
  const full = await remPx(page, 15.75);
  await expect
    .poll(
      async () =>
        (await page.locator('#bodies-panel').boundingBox())?.width ?? 0,
    )
    .toBeCloseTo(full, 0);
  const metrics = await page.evaluate(() => {
    const panel = document.querySelector('#bodies-panel');
    const title = document.querySelector('#bodies-panel-title');
    const toggle = document.querySelector('#bodies-collapse');
    if (panel === null || title === null || toggle === null) {
      throw new Error('missing bodies panel parts');
    }
    const panelBox = panel.getBoundingClientRect();
    const toggleBox = toggle.getBoundingClientRect();
    const titleBox = title.getBoundingClientRect();
    return {
      scrollWidth: panel.scrollWidth,
      clientWidth: panel.clientWidth,
      scrollLeft: panel.scrollLeft,
      titleHeight: titleBox.height,
      titleLineHeight: parseFloat(getComputedStyle(title).lineHeight),
      titleLeft: titleBox.left - panelBox.left,
      toggleLeft: toggleBox.left - panelBox.left,
      toggleRight: panelBox.right - toggleBox.right,
      toggleWidth: toggleBox.width,
    };
  });
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.scrollLeft).toBe(0);
  expect(metrics.titleHeight).toBeLessThanOrEqual(
    metrics.titleLineHeight + 0.5,
  );
  expect(metrics.titleLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.toggleLeft).toBeGreaterThan(metrics.titleLeft);
  expect(metrics.toggleRight).toBeGreaterThanOrEqual(0);
  expect(metrics.toggleWidth).toBeGreaterThanOrEqual(32);
  expect(metrics.toggleWidth).toBeLessThan(80);
}

test('bodies panel has no horizontal scroll at 1280x720 and 1920x1080', async ({
  page,
}) => {
  for (const size of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    const errors = await openAt(page, size);
    await assertPanelFits(page);

    // The user folds the list into the rail and opens it again.
    await page.getByTestId('bodies-collapse').click();
    await expect(page.getByTestId('bodies-collapse')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await assertRailFits(page);
    await page.getByTestId('bodies-collapse').click();
    await expect(page.locator('#bodies-panel')).not.toHaveClass(/is-rail/u);
    await assertPanelFits(page);

    await page.getByTestId('body-item-earth').click();
    if (size.width <= 1440) {
      await assertRailFits(page);
    } else {
      await assertPanelFits(page);
    }
    expect(errors).toEqual([]);
  }
});

// Widths in rem: 252 and 56 px at 16 px, larger on the projector root.
async function remPx(page: Page, rem: number): Promise<number> {
  return page.evaluate(
    (value) =>
      value * parseFloat(getComputedStyle(document.documentElement).fontSize),
    rem,
  );
}

async function assertRailFits(page: Page): Promise<void> {
  const panel = page.locator('#bodies-panel');
  await expect(panel).toHaveClass(/is-rail/u);
  const rail = await remPx(page, 3.5);
  await expect
    .poll(async () => (await panel.boundingBox())?.width ?? 0)
    .toBeCloseTo(rail, 0);
  const metrics = await panel.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
}

async function listWidth(page: Page): Promise<number> {
  return (await page.locator('#bodies-panel').boundingBox())?.width ?? 0;
}

test('list collapses to rail with selection at 1280', async ({ page }) => {
  const errors = await openAt(page, { width: 1280, height: 720 });
  expect(await listWidth(page)).toBeCloseTo(252, 0);

  await page.getByTestId('body-item-jupiter').click();
  await expect.poll(() => listWidth(page)).toBeCloseTo(56, 0);
  const dots = page.locator('#bodies-panel .bodies-item');
  await expect(dots).toHaveCount(9);
  await expect(page.getByTestId('body-item-jupiter')).toHaveAttribute(
    'aria-label',
    'Jowisz',
  );
  await expect(page.getByTestId('body-item-jupiter')).toHaveAttribute(
    'aria-current',
    'true',
  );
  for (const box of await dots.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().toJSON()),
  )) {
    expect(box.width).toBeCloseTo(44, 0);
    expect(box.height).toBeCloseTo(38, 0);
  }

  // Hover on a dot shows its name on the right.
  const mars = page.getByTestId('body-item-mars');
  await mars.hover();
  const tip = page.locator('.o-tooltip', { hasText: /^Mars$/u });
  await expect(tip).toBeVisible();
  const marsBox = await mars.boundingBox();
  const tipBox = await tip.boundingBox();
  expect((tipBox?.x ?? 0) - ((marsBox?.x ?? 0) + (marsBox?.width ?? 0))).toBe(
    8,
  );

  // Expand: the full list over the scene; the card does not move.
  const card = page.getByTestId('body-card');
  await expect(card).toBeVisible();
  await card.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  const cardBefore = await card.boundingBox();
  await page.getByTestId('bodies-collapse').click();
  await expect(page.locator('#bodies-panel')).toHaveClass(/is-overlay/u);
  await expect.poll(() => listWidth(page)).toBeCloseTo(252, 0);
  expect(await card.boundingBox()).toEqual(cardBefore);
  await page.getByTestId('body-item-saturn').click();
  await expect(page.locator('#bodies-panel')).not.toHaveClass(/is-overlay/u);
  await expect.poll(() => listWidth(page)).toBeCloseTo(56, 0);

  await page.locator('#viewport').focus();
  await page.keyboard.press('Escape');
  await expect.poll(() => listWidth(page)).toBeCloseTo(252, 0);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByTestId('body-item-saturn').click();
  await expect(page.getByTestId('body-card')).toBeVisible();
  expect(await listWidth(page)).toBeCloseTo(await remPx(page, 15.75), 0);

  // 1920 → 1300 with the card open: the list turns into the rail.
  await page.setViewportSize({ width: 1300, height: 800 });
  await expect.poll(() => listWidth(page)).toBeCloseTo(56, 0);
  expect(errors).toEqual([]);
});

test('au tooltip opens on focus', async ({ page }) => {
  await openAt(page, { width: 1280, height: 720 });
  await page.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
  });
  for (let step = 0; step < 10; step += 1) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') ?? '',
    );
    if (id === 'bodies-au-info') {
      break;
    }
  }
  const tip = page.locator('#tip-au');
  await expect(tip).toBeVisible();
  await expect(tip).toHaveAttribute('role', 'tooltip');
  await expect(tip.locator('strong')).toHaveText('1 j.a.');
  await expect(page.getByTestId('bodies-au-info')).toHaveAttribute(
    'aria-describedby',
    'tip-au',
  );
  const box = await tip.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1280 - 8);
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
});

test('card does not overlap panels', async ({ page }) => {
  for (const size of [
    { width: 1280, height: 720 },
    DESKTOP_WIDE,
    TABLET_LANDSCAPE,
  ]) {
    const errors = await openAt(page, size, '/?debug=1');
    const item = page.getByTestId('body-item-jupiter');
    if (!(await item.isVisible())) {
      await page.getByTestId('bodies-drawer-open').click();
    }
    await item.click();
    await page.waitForFunction(
      () => window.__orbitka?.getCameraState().flightActive === 0,
    );
    await expect(page.getByTestId('body-card')).toBeVisible();
    await settle(page);
    const card = await boxOf(page.getByTestId('body-card'));
    if (card === null) {
      throw new Error('card has no box');
    }
    const boxes = [{ name: 'card', box: card }, ...(await closedChrome(page))];
    await assertPairwise(boxes, size);
    expect(errors).toEqual([]);
  }
});
