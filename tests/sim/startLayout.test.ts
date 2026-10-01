import { expect, test } from 'vitest';

import { getBody } from '@data/bodies.ts';
import type { BodyDef } from '@data/types.ts';
import { circularStartPositionAu } from '@sim/startLayout.ts';

const EXPECTED_THETA_DEG = {
  mercury: 252.25,
  venus: 181.98,
  earth: 100.46,
  mars: 355.45,
  jupiter: 34.4,
  saturn: 49.95,
  uranus: 313.24,
  neptune: 304.88,
} as const;

function thetaDegrees(def: BodyDef): number {
  const out = { x: 0, y: 0, z: 0 };
  circularStartPositionAu(def, out);
  const degrees = (Math.atan2(out.y, out.x) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

test.each(Object.entries(EXPECTED_THETA_DEG))(
  'startLayout › theta › %s',
  (id, expected) => {
    const actual = thetaDegrees(getBody(id));
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.01);
  },
);

test('startLayout › długość = a', () => {
  for (const id of Object.keys(EXPECTED_THETA_DEG)) {
    const def = getBody(id);
    const orbit = def.orbit;
    if (orbit === undefined) {
      throw new Error(`brak orbity: ${id}`);
    }

    const out = { x: 1, y: 1, z: 1 };
    const result = circularStartPositionAu(def, out);
    const length = Math.hypot(result.x, result.y, result.z);

    expect(result).toBe(out);
    expect(result.z).toBe(0);
    expect(Math.abs(length - orbit.semiMajorAxisAu)).toBeLessThanOrEqual(1e-12);
  }
});

test('startLayout › błędy wejścia', () => {
  const earth = getBody('earth');
  const orbit = earth.orbit;
  if (orbit === undefined) {
    throw new Error('Ziemia nie ma orbity');
  }

  const out = { x: 0, y: 0, z: 0 };

  expect(() =>
    circularStartPositionAu({ ...earth, orbit: undefined }, out),
  ).toThrow('circularStartPositionAu: ciało „earth” nie ma orbit');

  expect(() =>
    circularStartPositionAu(
      { ...earth, orbit: { ...orbit, semiMajorAxisAu: 0 } },
      out,
    ),
  ).toThrow(RangeError);
  expect(() =>
    circularStartPositionAu(
      { ...earth, orbit: { ...orbit, semiMajorAxisAu: Number.NaN } },
      out,
    ),
  ).toThrow('semiMajorAxisAu');

  expect(() =>
    circularStartPositionAu(
      {
        ...earth,
        orbit: { ...orbit, argumentPeriapsisDeg: Number.POSITIVE_INFINITY },
      },
      out,
    ),
  ).toThrow(
    'circularStartPositionAu: parametr „argumentPeriapsisDeg” ciała „earth” musi być skończony, otrzymano Infinity',
  );
});
