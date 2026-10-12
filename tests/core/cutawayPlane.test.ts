import { expect, test } from 'vitest';

import {
  captureCutNormal,
  cutPlanePoint,
  easeOutCubic,
  layerDiscOffset,
  signedDistance,
  type CutawayVec3,
} from '@core/cutawayPlane.ts';

function vec(x: number, y: number, z: number): CutawayVec3 {
  return { x, y, z };
}

test('cutawayPlane › the normal points from the camera through the body', () => {
  const normal = vec(0, 0, 0);
  expect(captureCutNormal(vec(0, 0, 0), vec(0, 0, 10), normal)).toBe(true);
  expect(normal.x).toBeCloseTo(0);
  expect(normal.y).toBeCloseTo(0);
  expect(normal.z).toBeCloseTo(-1);
  expect(captureCutNormal(vec(1, 2, 3), vec(1, 2, 3), normal)).toBe(false);
});

test('cutawayPlane › the opening faces the camera and then stays', () => {
  const body = vec(2, 0, 0);
  const camera = vec(2, 0, 8);
  const normal = vec(0, 0, 0);
  expect(captureCutNormal(body, camera, normal)).toBe(true);

  const closed = vec(0, 0, 0);
  cutPlanePoint(body, normal, 1.5, 0, closed);
  // The whole body is on the kept side. The camera is on the clipped side.
  expect(signedDistance(normal, closed, body)).toBeCloseTo(1.5);
  expect(signedDistance(normal, closed, camera)).toBeLessThan(0);

  const open = vec(0, 0, 0);
  cutPlanePoint(body, normal, 1.5, 1, open);
  expect(open).toEqual(body);
  expect(signedDistance(normal, open, camera)).toBeLessThan(0);
  expect(
    signedDistance(
      normal,
      open,
      vec(body.x + normal.x, body.y + normal.y, body.z + normal.z),
    ),
  ).toBeGreaterThan(0);

  // The body moves. The normal is the one captured above, not a new aim.
  const moved = vec(5, 1, 0);
  const followed = vec(0, 0, 0);
  cutPlanePoint(moved, normal, 1.5, 1, followed);
  expect(followed).toEqual(moved);
  expect(normal.z).toBeCloseTo(-1);
});

test('cutawayPlane › rejects a bad radius or progress', () => {
  const out = vec(0, 0, 0);
  const body = vec(0, 0, 0);
  const normal = vec(0, 0, 1);
  expect(() => cutPlanePoint(body, normal, 0, 0, out)).toThrow(RangeError);
  expect(() => cutPlanePoint(body, normal, 1, Number.NaN, out)).toThrow(
    RangeError,
  );
});

test('cutawayPlane › easing and disc offsets', () => {
  expect(easeOutCubic(0)).toBe(0);
  expect(easeOutCubic(1)).toBe(1);
  expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  expect(() => easeOutCubic(Number.NaN)).toThrow(RangeError);

  const outer = layerDiscOffset(0, 3, 2);
  const inner = layerDiscOffset(2, 3, 2);
  expect(outer).toBeLessThan(inner);
  expect(inner).toBeLessThan(0);
  expect(() => layerDiscOffset(3, 3, 2)).toThrow(RangeError);
  expect(() => layerDiscOffset(0, 0, 2)).toThrow(RangeError);
});
