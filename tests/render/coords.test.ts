import { Vector3 } from 'three';
import { expect, test } from 'vitest';

import { eclipticToScene } from '@render/coords.ts';

test('coords › axes', () => {
  const out = new Vector3(9, 9, 9);

  expect(eclipticToScene({ x: 1, y: 2, z: 3 }, out)).toBe(out);
  expect(out.toArray()).toEqual([1, 3, -2]);

  const origin = new Vector3(4, 5, 6);
  expect(eclipticToScene({ x: 0, y: 0, z: 0 }, origin)).toBe(origin);
  expect(origin.x).toBeCloseTo(0, 12);
  expect(origin.y).toBeCloseTo(0, 12);
  expect(origin.z).toBeCloseTo(0, 12);
});

test('coords › zero', () => {
  const origin = new Vector3(-1, -1, -1);
  eclipticToScene({ x: 0, y: -0, z: 0 }, origin);

  expect(origin.x).toBeCloseTo(0, 12);
  expect(origin.y).toBeCloseTo(0, 12);
  expect(origin.z).toBeCloseTo(0, 12);
  expect(Object.is(origin.z, -0)).toBe(false);
});
