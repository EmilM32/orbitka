import { expect, type Page } from '@playwright/test';

import { PIXEL } from './fixtures.ts';

// A body to look for in the frame: its center on screen and its catalog color.
export type BodyProbe = {
  id: string;
  x: number;
  y: number;
  color: string;
};

export type CanvasPixels = {
  width: number;
  height: number;
  // Pixels brighter than any orbit line, so orbit lines alone give 0.
  brightFraction: number;
  // Per probe: lit pixels around the center whose color matches the body.
  matches: Record<string, number>;
};

// Panels such as the scale notice and the time controls sit on top of the
// canvas. A screenshot of the canvas box would count them as scene pixels.
const HIDE_OVERLAYS = 'body > :not(canvas) { visibility: hidden !important; }';

export async function assertWebGl(page: Page): Promise<void> {
  const available = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    return (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) !== null;
  });

  if (!available) {
    throw new Error('WebGL is unavailable in this browser (SwiftShader)');
  }
}

// Waits on the app's own frame counter (window.__orbitka.frameCount, only
// with ?debug=1) until `frames` more frames have been rendered.
export async function waitForFrames(page: Page, frames: number): Promise<void> {
  const start = await page.evaluate(() => window.__orbitka?.frameCount ?? 0);
  await page.waitForFunction(
    (target) => (window.__orbitka?.frameCount ?? 0) >= target,
    start + frames,
  );
}

// For pages without the debug hook: waits for `frames` browser animation
// frames. The app renders from renderer.setAnimationLoop, which runs on the
// same frames.
export async function waitForBrowserFrames(
  page: Page,
  frames: number,
): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count;
        const step = (): void => {
          left -= 1;
          if (left <= 0) {
            resolve();
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    frames,
  );
}

// One pixel read after frames have been rendered. Not a wait: callers wait
// with waitForFrames or waitForBrowserFrames first.
export async function expectPaintedFrame(
  page: Page,
  cssWidth: number,
  cssHeight: number,
  minBrightFill: number,
): Promise<CanvasPixels> {
  const frame = await readCanvasPixels(page, []);
  if (frame.width !== cssWidth || frame.height !== cssHeight) {
    throw new Error(
      `canvas is ${frame.width}×${frame.height}, expected ${cssWidth}×${cssHeight}`,
    );
  }

  expect(frame.brightFraction).toBeGreaterThanOrEqual(minBrightFill);
  return frame;
}

export async function readCanvasPixels(
  page: Page,
  probes: readonly BodyProbe[],
  pixel: {
    brightMin: number;
    litMin: number;
    chromaTolerance: number;
    windowRadius: number;
  } = PIXEL,
): Promise<CanvasPixels> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (box === null || box.width <= 0 || box.height <= 0) {
    throw new Error('canvas has no size');
  }

  const png = await canvas.screenshot({ style: HIDE_OVERLAYS });

  return page.evaluate(
    async ({ encoded, bodies, cssWidth, cssHeight, pixel }) => {
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: 'image/png' }),
      );
      const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = surface.getContext('2d');
      if (!context) {
        throw new Error('missing 2d context');
      }

      context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const channel = (offset: number): number => data[offset] ?? 0;
      const brightest = (offset: number): number =>
        Math.max(channel(offset), channel(offset + 1), channel(offset + 2));

      let bright = 0;
      const pixelCount = bitmap.width * bitmap.height;
      for (let index = 0; index < pixelCount; index += 1) {
        if (brightest(index * 4) >= pixel.brightMin) {
          bright += 1;
        }
      }

      // Lighting scales a color in linear light, so the channel ratios of a
      // lit or shaded body match its catalog color there, not in sRGB.
      const toLinear = (value: number): number => {
        const unit = value / 255;
        return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
      };
      const chromaticity = (r: number, g: number, b: number): number[] => {
        const linear = [toLinear(r), toLinear(g), toLinear(b)];
        const sum = linear.reduce((total, value) => total + value, 0);
        return sum === 0 ? [0, 0, 0] : linear.map((value) => value / sum);
      };
      const fromHex = (hex: string): number[] =>
        [1, 3, 5].map((start) =>
          Number.parseInt(hex.slice(start, start + 2), 16),
        );

      const scaleX = bitmap.width / cssWidth;
      const scaleY = bitmap.height / cssHeight;
      const matches: Record<string, number> = {};
      for (const body of bodies) {
        const [r = 0, g = 0, b = 0] = fromHex(body.color);
        const expected = chromaticity(r, g, b);
        const centerX = Math.round(body.x * scaleX);
        const centerY = Math.round(body.y * scaleY);
        let count = 0;
        for (let dy = -pixel.windowRadius; dy <= pixel.windowRadius; dy += 1) {
          for (
            let dx = -pixel.windowRadius;
            dx <= pixel.windowRadius;
            dx += 1
          ) {
            const x = centerX + dx;
            const y = centerY + dy;
            if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height) {
              continue;
            }

            const offset = (x + y * bitmap.width) * 4;
            if (brightest(offset) < pixel.litMin) {
              continue;
            }

            const actual = chromaticity(
              channel(offset),
              channel(offset + 1),
              channel(offset + 2),
            );
            const distance = Math.hypot(
              (actual[0] ?? 0) - (expected[0] ?? 0),
              (actual[1] ?? 0) - (expected[1] ?? 0),
              (actual[2] ?? 0) - (expected[2] ?? 0),
            );
            if (distance <= pixel.chromaTolerance) {
              count += 1;
            }
          }
        }
        matches[body.id] = count;
      }

      return {
        width: bitmap.width,
        height: bitmap.height,
        brightFraction: bright / pixelCount,
        matches,
      };
    },
    {
      encoded: png.toString('base64'),
      bodies: probes,
      cssWidth: box.width,
      cssHeight: box.height,
      pixel,
    },
  );
}

// Middle of the part of the window the body card or the sheet leaves free
// (ADR-009 annex): ((W - right) / 2, (H - bottom) / 2) from the debug hook.
export async function freeAreaCenter(
  page: Page,
): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const hook = window.__orbitka;
    if (!hook) {
      throw new Error('missing debug hook');
    }
    const insets = hook.getViewInsets();
    return {
      x: (window.innerWidth - insets.right) / 2,
      y: (window.innerHeight - insets.bottom) / 2,
    };
  });
}

// "Trening pilota" shows on the first visit and changes the layout. Specs
// that test something else mark it done before the app loads (EMI-201).
export async function skipCoach(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('orbitka.coach.done', '1');
    } catch {
      // No storage: the training shows; the spec runs anyway.
    }
  });
}
