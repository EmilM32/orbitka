import { expect, test } from 'vitest';

import {
  compressPositionAu,
  distanceToScene,
  moonDistanceToScene,
  moonRadiusToScene,
  radiusToScene,
  SCALE,
  type Vec3,
} from '@sim/scale.ts';

const MERCURY = { semiMajorAxisAu: 0.38709927, eccentricity: 0.20563593 };
const SUN_RADIUS_KM = 695700;
const EARTH_RADIUS_KM = 6371;
const JUPITER_RADIUS_KM = 69911;

function expectNear(actual: number, expected: number, tolerance: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

function grid(from: number, to: number, steps: number): number[] {
  return Array.from(
    { length: steps + 1 },
    (_, index) => from * (to / from) ** (index / steps),
  );
}

test('distance grows strictly from 0.1 to 50 AU', () => {
  const distances = grid(0.1, 50, 200).map(distanceToScene);

  for (let index = 1; index < distances.length; index += 1) {
    expect(distances[index]).toBeGreaterThan(distances[index - 1] ?? Infinity);
  }
});

test('distance is 0 at and below 0 AU', () => {
  expect(distanceToScene(0)).toBe(0);
  expect(distanceToScene(-1)).toBe(0);
});

test('radius never shrinks from 1 to 1e6 km', () => {
  const radii = grid(1, 1e6, 200).map(radiusToScene);

  for (let index = 1; index < radii.length; index += 1) {
    expect(radii[index]).toBeGreaterThanOrEqual(radii[index - 1] ?? Infinity);
  }
});

test('radius stays within its bounds', () => {
  expect(radiusToScene(1)).toBe(SCALE.radiusMin);
  expect(radiusToScene(1e9)).toBe(SCALE.radiusMax);
  expect(radiusToScene(0)).toBe(SCALE.radiusMin);
  expect(radiusToScene(-5)).toBe(SCALE.radiusMin);
});

test.each([
  ['Mercury', 0.38709927, 4.98],
  ['Venus', 0.72333566, 6.8],
  ['Earth', 1.00000261, 8.0],
  ['Mars', 1.52371034, 9.88],
  ['Jupiter', 5.202887, 18.25],
  ['Saturn', 9.53667594, 24.71],
  ['Uranus', 19.18916464, 35.04],
  ['Neptune', 30.06992276, 43.87],
])('%s sits at its control distance', (_name, semiMajorAxisAu, expected) => {
  expectNear(distanceToScene(semiMajorAxisAu), expected, 0.01);
});

test.each([
  ['the Sun', SUN_RADIUS_KM, 3.26],
  ['Mercury', 2439.7, 0.34],
  ['the Earth', EARTH_RADIUS_KM, 0.5],
  ['Jupiter', JUPITER_RADIUS_KM, 1.3],
])('%s has its control radius', (_name, km, expected) => {
  expectNear(radiusToScene(km), expected, 0.01);
});

test('the Sun does not cover the orbit of Mercury', () => {
  const perihelion = distanceToScene(
    MERCURY.semiMajorAxisAu * (1 - MERCURY.eccentricity),
  );

  expect(radiusToScene(SUN_RADIUS_KM)).toBeLessThan(perihelion - 1.0);
  expect(SCALE.radiusMax).toBeLessThan(perihelion - 1.0);
});

test.each([
  ['the Moon', 384400, EARTH_RADIUS_KM, 1.0],
  ['Io', 421800, JUPITER_RADIUS_KM, 2.1],
  ['Callisto', 1882700, JUPITER_RADIUS_KM, 2.3],
])(
  '%s sits at its control distance from its planet',
  (_name, distanceKm, parentRadiusKm, expected) => {
    expectNear(moonDistanceToScene(distanceKm, parentRadiusKm), expected, 0.05);
  },
);

test.each([
  ['the Moon', 384400, EARTH_RADIUS_KM],
  ['Io', 421800, JUPITER_RADIUS_KM],
  ['Europa', 671100, JUPITER_RADIUS_KM],
  ['Ganymede', 1070400, JUPITER_RADIUS_KM],
  ['Callisto', 1882700, JUPITER_RADIUS_KM],
])(
  '%s orbits outside 1.5 times the planet radius',
  (_name, distanceKm, parentRadiusKm) => {
    expect(moonDistanceToScene(distanceKm, parentRadiusKm)).toBeGreaterThan(
      radiusToScene(parentRadiusKm) * 1.5,
    );
  },
);

test('moon distance grows with the real distance', () => {
  const distances = grid(1e4, 1e7, 100).map((km) =>
    moonDistanceToScene(km, JUPITER_RADIUS_KM),
  );

  for (let index = 1; index < distances.length; index += 1) {
    expect(distances[index]).toBeGreaterThan(distances[index - 1] ?? Infinity);
  }
});

test('moon distance is 0 at and below 0 km', () => {
  expect(moonDistanceToScene(0, EARTH_RADIUS_KM)).toBe(0);
  expect(moonDistanceToScene(-1, EARTH_RADIUS_KM)).toBe(0);
});

test('moon radius has its control value and stays within its bounds', () => {
  expectNear(moonRadiusToScene(1737.4), 0.16, 0.01);
  expect(moonRadiusToScene(1)).toBe(SCALE.moonRadiusMin);
  expect(moonRadiusToScene(1e9)).toBe(SCALE.moonRadiusMax);
  expect(moonRadiusToScene(0)).toBe(SCALE.moonRadiusMin);
});

test('compressPositionAu maps 1 AU on the x axis to k scene units', () => {
  const out: Vec3 = { x: 9, y: 9, z: 9 };

  expect(compressPositionAu(1, 0, 0, out)).toEqual({ x: 8, y: 0, z: 0 });
});

test('compressPositionAu keeps the direction and compresses the length', () => {
  const out: Vec3 = { x: 0, y: 0, z: 0 };
  const result = compressPositionAu(0, 3, 4, out);
  const length = Math.hypot(result.x, result.y, result.z);

  expect(result).toBe(out);
  expect(length).toBeCloseTo(distanceToScene(5), 12);
  expect(result.x / length).toBeCloseTo(0, 12);
  expect(result.y / length).toBeCloseTo(0.6, 12);
  expect(result.z / length).toBeCloseTo(0.8, 12);
});

test('compressPositionAu maps the origin to the origin', () => {
  const out: Vec3 = { x: 1, y: 2, z: 3 };

  expect(compressPositionAu(0, 0, 0, out)).toBe(out);
  expect(out).toEqual({ x: 0, y: 0, z: 0 });
});
