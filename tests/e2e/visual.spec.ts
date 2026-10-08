import { expect, test, type Page } from '@playwright/test';

import { assertWebGl, waitForFrames } from './helpers.ts';

// Baselines exist only for Chromium on Linux in the Playwright image that CI
// uses (ADR-010 point 12). Anywhere else fonts and antialiasing differ, so the
// suite runs only when ORBITKA_VISUAL=1: CI and `npm run test:visual` set it.
test.skip(
  process.env.ORBITKA_VISUAL !== '1',
  'visual snapshots run only in the Playwright image (npm run test:visual)',
);

test.use({ reducedMotion: 'reduce' });

// Frozen date (J2000), paused clock, debug hook for frameCount. `quality` is
// read once the quality levels land (ADR-010 point 9); until then it is
// ignored and keeps the URL stable for the baselines.
const START_PATH = '/?debug=1&days=0&paused=1&quality=medium';

// The WebGL scene is rendered by SwiftShader and its pixels may differ between
// machines, so the canvas is hidden and the page shows one plain space color.
// The scene itself is covered by smoke.spec.ts through window.__orbitka. A
// mask would not work: the canvas fills the window, so its mask rectangle
// would also cover the panels above it (ADR-010 point 12). The debug hook
// needs ?debug=1, but its FPS overlay is not part of the UI. This is a style
// tag, not a stylePath file: stylesheets live only in src/ui and src/style.css.
const HIDE_SCENE = `
  #viewport, #debug-overlay { visibility: hidden !important; }
  html, body { background: #000 !important; }
`;

const DESKTOP = { width: 1280, height: 720 };
const DESKTOP_FULL_HD = { width: 1920, height: 1080 };
const TABLET_PORTRAIT = { width: 768, height: 1024 };
const TABLET_LANDSCAPE = { width: 1024, height: 768 };

async function openStable(
  page: Page,
  size: { width: number; height: number },
): Promise<void> {
  await page.setViewportSize(size);
  await page.goto('about:blank');
  await assertWebGl(page);
  await page.goto(START_PATH);
  await page.addStyleTag({ content: HIDE_SCENE });
  await page.locator('#scale-notice').waitFor();
  await page.locator('#time-controls').waitFor();
  await page.locator('[data-testid="view-controls"]').waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForFunction(() => (window.__orbitka?.frameCount ?? 0) > 0);
  await settle(page);
}

// Labels and layout variables follow the drawn frame, so wait a few more
// frames after any interaction before the snapshot.
async function settle(page: Page): Promise<void> {
  await waitForFrames(page, 3);
  // New text (a card, an open sheet) can need a latin-ext face that has not
  // loaded yet; snapshot after the swap.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

test('start 1280×720', async ({ page }) => {
  await openStable(page, DESKTOP);
  await expect(page).toHaveScreenshot('start-1280x720.png');
});

test('start 1920×1080', async ({ page }) => {
  await openStable(page, DESKTOP_FULL_HD);
  await expect(page).toHaveScreenshot('start-1920x1080.png');
});

test('tablet 768×1024 with the bodies drawer open', async ({ page }) => {
  await openStable(page, TABLET_PORTRAIT);
  await page.getByTestId('bodies-drawer-open').click();
  await expect(page.getByTestId('bodies-drawer')).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot('tablet-768x1024-drawer.png');
});

test('scale explanation dialog 1280×720', async ({ page }) => {
  await openStable(page, DESKTOP);
  await page.locator('#scale-why').click();
  await expect(page.locator('#scale-explanation')).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot('why-dialog-1280x720.png');
});

async function selectAndSettle(page: Page, id: string): Promise<void> {
  const item = page.getByTestId(`body-item-${id}`);
  if (!(await item.isVisible())) {
    await page.getByTestId('bodies-drawer-open').click();
  }
  await item.click();
  await page.waitForFunction(
    () => window.__orbitka?.getCameraState().flightActive === 0,
  );
  await expect(page.getByTestId('body-card')).toBeVisible();
  // The click leaves hover and focus on the list; park the pointer.
  await page.mouse.move(0, 0);
  await page.locator('#viewport').focus();
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await settle(page);
}

test('Jupiter selected with the body card 1280×720', async ({ page }) => {
  await openStable(page, DESKTOP);
  await selectAndSettle(page, 'jupiter');
  await expect(page).toHaveScreenshot('jupiter-card-1280x720.png');
});

test('Saturn selected with the sheet 1024×768', async ({ page }) => {
  await openStable(page, TABLET_LANDSCAPE);
  await selectAndSettle(page, 'saturn');
  await expect(page).toHaveScreenshot('saturn-card-1024x768.png');
});

test('tablet 768×1024 with the sheet expanded', async ({ page }) => {
  await openStable(page, TABLET_PORTRAIT);
  await selectAndSettle(page, 'saturn');
  await page.getByTestId('body-card-handle').click();
  await expect(page.getByTestId('body-card-handle')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page.mouse.move(0, 0);
  // The sheet grows with a height transition; snapshot its end state.
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await settle(page);
  await expect(page).toHaveScreenshot('tablet-768x1024-sheet.png');
});
