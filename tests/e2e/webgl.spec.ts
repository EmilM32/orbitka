import { expect, test } from '@playwright/test';

import { assertWebGl, skipCoach, waitForFrames } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await skipCoach(page);
});

test('no WebGL shows a notice instead of a black page', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type.includes('webgl')) {
        return null;
      }
      return (original as (...args: unknown[]) => unknown).call(
        this,
        type,
        ...rest,
      );
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.goto('/');

  const notice = page.getByRole('alert');
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('heading')).toHaveText(
    'Ta przeglądarka nie pokaże sceny 3D',
  );
  await expect(page.locator('#viewport')).toBeHidden();
  await expect(
    page.getByRole('region', { name: 'Sterowanie czasem' }),
  ).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('a lost WebGL context offers a reload', async ({ page }) => {
  await page.goto('about:blank');
  await assertWebGl(page);
  await page.goto('/?debug=1&paused=1');
  await waitForFrames(page, 3);

  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#viewport');
    const gl = canvas?.getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });

  const notice = page.getByRole('alert');
  await expect(notice.getByRole('heading')).toHaveText(
    'Scena 3D przestała działać',
  );
  await expect(
    notice.getByRole('button', { name: 'Odśwież stronę' }),
  ).toBeVisible();
});
