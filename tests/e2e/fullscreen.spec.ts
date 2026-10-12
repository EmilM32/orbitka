import { expect, test, type Page } from '@playwright/test';

import { assertWebGl, skipCoach } from './helpers.ts';

// EMI-247: a full screen button in the "Widok" group, for a classroom projector.

test.beforeEach(async ({ page }) => {
  await skipCoach(page);
  // The real full screen needs a user gesture and a visible window; the app
  // is checked against a stand-in that behaves like the API.
  await page.addInitScript(() => {
    const state = { element: null as Element | null, requests: 0, exits: 0 };
    Object.defineProperty(document, 'fullscreenEnabled', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(document, 'fullscreenElement', {
      get: () => state.element,
      configurable: true,
    });
    // The page's own script has not made <html> yet: patch the prototypes.
    Element.prototype.requestFullscreen = function request(this: Element) {
      state.requests += 1;
      state.element = this;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    };
    Document.prototype.exitFullscreen = () => {
      state.exits += 1;
      state.element = null;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    };
    (window as unknown as { __fs: typeof state }).__fs = state;
  });
});

async function openApp(page: Page): Promise<void> {
  await page.goto('about:blank');
  await assertWebGl(page);
  await page.goto('/?debug=1&days=0');
  await page.locator('canvas').waitFor();
  await page.waitForFunction(() => (window.__orbitka?.frameCount ?? 0) > 3);
}

async function calls(page: Page): Promise<{ requests: number; exits: number }> {
  return page.evaluate(() => {
    const state = (
      window as unknown as { __fs: { requests: number; exits: number } }
    ).__fs;
    return { requests: state.requests, exits: state.exits };
  });
}

test('the button asks for full screen and follows its state', async ({
  page,
}) => {
  await openApp(page);
  const button = page.getByTestId('view-fullscreen');
  await expect(button).toBeVisible();
  await expect(button).toHaveAccessibleName('Pełny ekran');
  await expect(button).toHaveAttribute('aria-pressed', 'false');

  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(await calls(page)).toEqual({ requests: 1, exits: 0 });

  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(await calls(page)).toEqual({ requests: 1, exits: 1 });
});

test('F does the same, and the list of shortcuts says so', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('f');
  await expect(page.getByTestId('view-fullscreen')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('F');
  await expect(page.getByTestId('view-fullscreen')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(await calls(page)).toEqual({ requests: 1, exits: 1 });

  await page.keyboard.press('Shift+?');
  const dialog = page.getByRole('dialog', { name: 'Skróty klawiszowe' });
  await expect(dialog).toContainText('Pełny ekran');
});

for (const size of [
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
]) {
  test(`the Widok group keeps its buttons apart at ${size.width}×${size.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openApp(page);
    const group = await page.getByTestId('view-controls').boundingBox();
    const boxes = await page
      .getByTestId('view-controls')
      .locator('> button')
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const { x, y, width, height } = button.getBoundingClientRect();
          return {
            id: button.getAttribute('data-testid'),
            x,
            y,
            width,
            height,
          };
        }),
      );
    expect(boxes.map((box) => box.id)).toContain('view-fullscreen');
    if (group === null) {
      throw new Error('no group box');
    }
    expect(group.x).toBeGreaterThanOrEqual(0);
    expect(group.x + group.width).toBeLessThanOrEqual(size.width);
    for (let index = 0; index < boxes.length; index += 1) {
      const a = boxes[index];
      if (a === undefined || a.width === 0) {
        continue;
      }
      expect(a.x).toBeGreaterThanOrEqual(group.x - 1);
      expect(a.x + a.width).toBeLessThanOrEqual(group.x + group.width + 1);
      for (const b of boxes.slice(index + 1)) {
        if (b.width === 0) {
          continue;
        }
        const overlapX =
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY =
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        expect(overlapX > 0.5 && overlapY > 0.5, `${a.id} and ${b.id}`).toBe(
          false,
        );
      }
    }
  });
}

test('no button where the browser has no full screen', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'fullscreenEnabled', {
      value: false,
      configurable: true,
    });
  });
  await openApp(page);
  await expect(page.getByTestId('view-fullscreen')).toBeHidden();
  await page.keyboard.press('f');
  expect(await calls(page)).toEqual({ requests: 0, exits: 0 });
});
