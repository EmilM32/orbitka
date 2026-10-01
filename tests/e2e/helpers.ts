import { expect, type Page } from '@playwright/test';

export type PixelSample = {
  x: number;
  y: number;
};

export type CanvasContrast = {
  width: number;
  height: number;
  differentFraction: number;
  sampleDiffers: boolean[];
};

export async function assertWebGl(page: Page): Promise<void> {
  const available = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    return (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) !== null;
  });

  if (!available) {
    throw new Error('WebGL is unavailable in this browser (SwiftShader)');
  }
}

export async function waitForPaintedFrame(
  page: Page,
  cssWidth: number,
  cssHeight: number,
): Promise<CanvasContrast> {
  const frames: CanvasContrast[] = [];

  await expect
    .poll(
      async () => {
        const box = await page.locator('canvas').boundingBox();
        if (box === null || box.width <= 0 || box.height <= 0) {
          return 0;
        }

        const contrast = await readCanvasContrast(
          page,
          [],
          box.width,
          box.height,
        );
        frames.push(contrast);
        return contrast.differentFraction;
      },
      { timeout: 10_000, intervals: [50, 100, 200, 400] },
    )
    .toBeGreaterThanOrEqual(0.0015);

  const latest = frames.at(-1);
  if (latest === undefined) {
    throw new Error('no painted frame');
  }

  if (latest.width !== cssWidth || latest.height !== cssHeight) {
    throw new Error(
      `canvas is ${latest.width}×${latest.height}, expected ${cssWidth}×${cssHeight}`,
    );
  }

  return latest;
}

export async function readCanvasContrast(
  page: Page,
  samples: readonly PixelSample[],
  cssWidth: number,
  cssHeight: number,
): Promise<CanvasContrast> {
  const png = await page.locator('canvas').screenshot();

  return page.evaluate(
    async ({ encoded, points, cssWidth: widthCss, cssHeight: heightCss }) => {
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
      const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
      const backgroundIndex = (2 + 2 * bitmap.width) * 4;

      const differs = (offset: number): boolean => {
        const data = image.data;
        const background = backgroundIndex;
        return (
          Math.abs((data[offset] ?? 0) - (data[background] ?? 0)) > 6 ||
          Math.abs((data[offset + 1] ?? 0) - (data[background + 1] ?? 0)) > 6 ||
          Math.abs((data[offset + 2] ?? 0) - (data[background + 2] ?? 0)) > 6
        );
      };

      let different = 0;
      const pixelCount = bitmap.width * bitmap.height;
      for (let index = 0; index < pixelCount; index += 1) {
        if (differs(index * 4)) {
          different += 1;
        }
      }

      const scaleX = bitmap.width / widthCss;
      const scaleY = bitmap.height / heightCss;
      const sampleDiffers = points.map((point) => {
        const x = Math.round(point.x * scaleX);
        const y = Math.round(point.y * scaleY);
        if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height) {
          return false;
        }
        return differs((x + y * bitmap.width) * 4);
      });

      return {
        width: bitmap.width,
        height: bitmap.height,
        differentFraction: different / pixelCount,
        sampleDiffers,
      };
    },
    {
      encoded: png.toString('base64'),
      points: samples,
      cssWidth,
      cssHeight,
    },
  );
}
