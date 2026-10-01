import { Vector3 } from 'three';
import { expect, test } from 'vitest';

import { eclipticToScene } from '@render/coords.ts';

test('coords › osie', () => {
  const out = new Vector3(9, 9, 9);

  expect(eclipticToScene({ x: 1, y: 2, z: 3 }, out)).toBe(out);
  expect(out.toArray()).toEqual([1, 3, -2]);

  const origin = new Vector3(4, 5, 6);
  expect(eclipticToScene({ x: 0, y: 0, z: 0 }, origin)).toBe(origin);
  expect(origin.toArray()).toEqual([0, 0, 0]);
});
