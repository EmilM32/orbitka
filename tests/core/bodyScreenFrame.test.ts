import { expect, test } from 'vitest';

import {
  createBodyScreenFrame,
  sphereScreenRadiusPx,
} from '@core/bodyScreenFrame.ts';
import { VIEW_CONFIG } from '@core/viewConfig.ts';

test('frame arrays', () => {
  const ids = ['sun', 'earth', 'neptune'];
  const frame = createBodyScreenFrame(ids);

  expect(frame.count).toBe(3);
  expect(frame.ids).toEqual(ids);
  expect(frame.ids).not.toBe(ids);
  expect(frame.x).toBeInstanceOf(Float64Array);
  expect(frame.y).toBeInstanceOf(Float64Array);
  expect(frame.depth).toBeInstanceOf(Float64Array);
  expect(frame.radiusPx).toBeInstanceOf(Float64Array);
  expect(frame.visible).toBeInstanceOf(Uint8Array);
  expect(frame.x.length).toBe(frame.count);
  expect(frame.y.length).toBe(frame.count);
  expect(frame.depth.length).toBe(frame.count);
  expect(frame.radiusPx.length).toBe(frame.count);
  expect(frame.visible.length).toBe(frame.count);
  expect(Array.from(frame.visible)).toEqual([0, 0, 0]);
  expect(Array.from(frame.x)).toEqual([0, 0, 0]);
  expect(Array.from(frame.depth)).toEqual([0, 0, 0]);

  ids[0] = 'pluto';
  expect(frame.ids[0]).toBe('sun');

  const empty = createBodyScreenFrame([]);
  expect(empty.count).toBe(0);
  expect(empty.x.length).toBe(0);
  expect(empty.visible.length).toBe(0);
});

const FOCAL_PX = 360 / Math.tan(Math.PI / 8);
const FALLBACK_PX = 1500;

test('sphereScreenRadiusPx on axis is the angular radius', () => {
  for (const distance of [2.5, 6, 40]) {
    const expected = FOCAL_PX * Math.tan(Math.asin(1 / distance));
    expect(
      sphereScreenRadiusPx(1, 0, distance, FOCAL_PX, FALLBACK_PX),
    ).toBeCloseTo(expected, 9);
  }
});

test('sphereScreenRadiusPx keeps the ring outside the disc at max zoom', () => {
  // Camera 2.5 radii from the centre: r / depth undershoots by about 9 %.
  const radius = 1.5;
  const distance = 2.5 * radius;
  const disc = sphereScreenRadiusPx(radius, 0, distance, FOCAL_PX, 1e9);
  const smallAngle = (radius / distance) * FOCAL_PX;
  expect(disc / smallAngle).toBeGreaterThan(1.08);

  const ringInner =
    Math.max(
      disc + VIEW_CONFIG.selectionRingPaddingPx,
      VIEW_CONFIG.selectionRingMinRadiusPx,
    ) - 2;
  expect(ringInner).toBeGreaterThan(disc);
});

test('sphereScreenRadiusPx covers the far edge off axis', () => {
  const radius = 1;
  const lateral = 6;
  const depth = 8;
  const theta = Math.atan2(lateral, depth);
  const alpha = Math.asin(radius / Math.hypot(lateral, depth));
  const farEdge = FOCAL_PX * (Math.tan(theta + alpha) - Math.tan(theta));
  const result = sphereScreenRadiusPx(
    radius,
    lateral,
    depth,
    FOCAL_PX,
    FALLBACK_PX,
  );
  expect(result).toBeCloseTo(farEdge, 9);
  expect(result).toBeGreaterThan(
    sphereScreenRadiusPx(radius, 0, 10, FOCAL_PX, FALLBACK_PX),
  );
});

test('sphereScreenRadiusPx edge cases', () => {
  expect(sphereScreenRadiusPx(1, 0, 0.5, FOCAL_PX, FALLBACK_PX)).toBe(
    FALLBACK_PX,
  );
  expect(sphereScreenRadiusPx(1, 0, 1, FOCAL_PX, FALLBACK_PX)).toBe(
    FALLBACK_PX,
  );
  // Outline crosses the camera plane on the far side.
  expect(sphereScreenRadiusPx(1, 50, 0.9, FOCAL_PX, FALLBACK_PX)).toBe(
    FALLBACK_PX,
  );
  expect(sphereScreenRadiusPx(1, 0, 1.0001, FOCAL_PX, FALLBACK_PX)).toBe(
    FALLBACK_PX,
  );
  expect(sphereScreenRadiusPx(1, 0, -5, FOCAL_PX, FALLBACK_PX)).toBe(0);
  expect(sphereScreenRadiusPx(0, 0, 5, FOCAL_PX, FALLBACK_PX)).toBe(0);
  expect(sphereScreenRadiusPx(Number.NaN, 0, 5, FOCAL_PX, FALLBACK_PX)).toBe(0);
  expect(sphereScreenRadiusPx(1, Number.NaN, 5, FOCAL_PX, FALLBACK_PX)).toBe(0);
  expect(sphereScreenRadiusPx(1, 0, 5, 0, FALLBACK_PX)).toBe(0);
});
