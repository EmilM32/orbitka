import { expect, test, type Page } from '@playwright/test';

import { assertWebGl, freeAreaCenter, waitForFrames } from './helpers.ts';

// EMI-200: the body card on the desktop and the bottom sheet on the tablet.

const DEBUG_PATH = '/?debug=1&days=0&paused=1';
const CENTER_PX = 3;

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
  await page.goto('about:blank');
  await assertWebGl(page);
  await page.goto(DEBUG_PATH);
  await page.waitForFunction(() => (window.__orbitka?.frameCount ?? 0) > 2);
}

async function waitForFlightEnd(page: Page): Promise<void> {
  await page.waitForFunction(
    () => window.__orbitka?.getCameraState().flightActive === 0,
  );
}

async function select(page: Page, id: string): Promise<void> {
  const item = page.getByTestId(`body-item-${id}`);
  if (!(await item.isVisible())) {
    await page.getByTestId('bodies-drawer-open').click();
  }
  await item.click();
  await waitForFlightEnd(page);
  await expect(page.getByTestId('body-card')).toBeVisible();
  await waitForFrames(page, 3);
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

async function bodyPoint(
  page: Page,
  id: string,
): Promise<{ x: number; y: number }> {
  return page.evaluate((target) => {
    const point = window.__orbitka
      ?.getBodyScreenPositions()
      .find((entry) => entry.id === target);
    if (point === undefined) {
      throw new Error(`missing ${target}`);
    }
    return { x: point.x, y: point.y };
  }, id);
}

async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (box === null) {
    throw new Error(`${selector} has no box`);
  }
  return box;
}

test('jupiter card at 1280', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page, { width: 1280, height: 720 });
  await select(page, 'jupiter');

  const card = page.getByTestId('body-card');
  await expect(card.locator('h2')).toHaveText('Jowisz');
  await expect(card).toContainText('gazowy olbrzym');
  await expect(card).toContainText('ok. 11 × Ziemia');
  await expect(card).toContainText(
    'Na średnicy Jowisza zmieści się ok. 11 Ziem.',
  );
  await expect(card).toContainText('Rok trwa11,9 roku');
  await expect(card).toContainText('Obrót wokół osi9 h 56 min');
  await expect(card.locator('a[href^="https://"]')).toHaveCount(1);

  const box = await boxOf(page, '#body-card');
  expect(box.width).toBeCloseTo(320, 0);
  expect(box.x + box.width).toBeCloseTo(1280 - 16, 0);
  expect(box.y).toBeCloseTo(72, 0);
  expect(await viewInsets(page)).toEqual({ right: 352, bottom: 0 });
  const center = await freeAreaCenter(page);
  expect(center).toEqual({ x: 464, y: 360 });

  await page.locator('#viewport').focus();
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  expect(await viewInsets(page)).toEqual({ right: 0, bottom: 0 });
  expect(errors).toEqual([]);
});

// Needs the frame shift in render (EMI-219): until then the body stays in the
// middle of the window, not of the free area.
test.fixme('jupiter stands in the middle of the free area', async ({
  page,
}) => {
  await open(page, { width: 1280, height: 720 });
  await select(page, 'jupiter');
  const center = await freeAreaCenter(page);
  const jupiter = await bodyPoint(page, 'jupiter');
  expect(Math.abs(jupiter.x - center.x)).toBeLessThanOrEqual(CENTER_PX);
  expect(Math.abs(jupiter.y - center.y)).toBeLessThanOrEqual(CENTER_PX);
});

test('mercury and the sun', async ({ page }) => {
  await open(page, { width: 1280, height: 720 });
  await select(page, 'mercury');
  const card = page.getByTestId('body-card');
  await expect(card).toContainText('0,38 × Ziemia');
  await expect(card).toContainText(
    'Ziemia jest ok. 2,6 raza szersza od Merkurego.',
  );
  await expect(card).toContainText('Rok trwa88 dni');

  await page.getByTestId('body-item-sun').click();
  await expect(card.locator('h2')).toHaveText('Słońce');
  await expect(card).toContainText('ok. 109 × Ziemia');
  await expect(card).not.toContainText('Rok trwa');
  await expect(card.locator('.gauge-bar')).toHaveCount(0);
});

test('close paths and more', async ({ page }) => {
  await open(page, { width: 1280, height: 720 });
  const card = page.getByTestId('body-card');
  for (const close of ['x', 'system', 'Escape', 'Home'] as const) {
    await select(page, 'saturn');
    if (close === 'x') {
      await page.getByTestId('body-card-close').click();
    } else if (close === 'system') {
      await page.getByTestId('body-card-system').click();
    } else {
      await page.getByTestId('body-card-close').focus();
      await page.keyboard.press(close);
    }
    await expect(card, close).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => window.__orbitka?.getSelectedId()))
      .toBeNull();
  }

  await select(page, 'mars');
  const more = page.getByTestId('body-card-more');
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(more).toHaveText('Mniej');
  await expect(page.locator('#card-description')).toBeVisible();
});

test('tab order', async ({ page }) => {
  await open(page, { width: 1280, height: 720 });
  await select(page, 'jupiter');
  await page.getByTestId('body-item-jupiter').focus();
  const order: string[] = [];
  for (let step = 0; step < 15; step += 1) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => {
      const active = document.activeElement;
      return active?.getAttribute('data-testid') ?? active?.id ?? '';
    });
    order.push(id);
    if (id === 'view-reset') {
      break;
    }
  }
  expect(order[0]).toBe('body-item-saturn');
  const fromCanvas = order.slice(order.indexOf('viewport'));
  expect(fromCanvas[0]).toBe('viewport');
  expect(fromCanvas[1]).toBe('body-card-close');
  expect(fromCanvas.at(-1)).toBe('view-reset');
  // The card never takes focus by itself.
  await page.getByTestId('body-item-mars').click();
  await expect(page.getByTestId('body-item-mars')).toBeFocused();
});

test('sheet on tablet', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await open(page, { width: 768, height: 1024 });
  await select(page, 'saturn');

  const sheet = await boxOf(page, '#body-card');
  const time = await boxOf(page, '#time-controls');
  expect(Math.abs(sheet.height - 112)).toBeLessThanOrEqual(1);
  expect(Math.abs(time.y - (sheet.y + sheet.height) - 12)).toBeLessThanOrEqual(
    1,
  );
  expect(await viewInsets(page)).toEqual({
    right: 0,
    bottom: Math.round(1024 - sheet.y),
  });

  const handle = page.getByTestId('body-card-handle');
  await expect(handle).toHaveAttribute('aria-expanded', 'false');
  await handle.tap();
  await expect(handle).toHaveAttribute('aria-expanded', 'true');
  await expect
    .poll(async () => (await boxOf(page, '#body-card')).height)
    .toBeGreaterThan(200);
  await page.waitForTimeout(500);
  const expanded = await boxOf(page, '#body-card');
  expect(expanded.height).toBeLessThanOrEqual(1024 * 0.6 + 1);
  await expect
    .poll(async () => (await viewInsets(page)).bottom)
    .toBe(Math.round(1024 - expanded.y));
  await context.close();
});

test('card scrolls at a low window', async ({ page }) => {
  await open(page, { width: 1280, height: 600 });
  await select(page, 'saturn');
  await page.getByTestId('body-card-more').click();
  const scroll = await page
    .getByTestId('body-card-scroll')
    .evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }));
  expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
  for (const id of ['body-card-system', 'body-card-more']) {
    const box = await boxOf(page, `[data-testid="${id}"]`);
    expect(box.y + box.height, id).toBeLessThanOrEqual(600);
  }
});
