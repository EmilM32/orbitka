import { expect, test } from 'vitest';

import { getBody } from '@data/bodies.ts';
import type { BodyDef, BodyType, OrbitDef } from '@data/types.ts';
import { bodyPositionAu, solveKepler } from '@sim/kepler.ts';

const PLANETS = [
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
] as const;

const MODEL_AT_EPOCH = {
  mercury: [-0.13009, -0.44729, -0.0246],
  venus: [-0.71832, -0.03271, 0.04102],
  earth: [-0.17717, 0.96721, 0],
  mars: [1.39067, -0.01339, -0.03446],
  jupiter: [3.99832, 2.94571, -0.10172],
  saturn: [6.41478, 6.54567, -0.36915],
  uranus: [14.42547, -13.73765, -0.23803],
  neptune: [16.80477, -24.99271, 0.1274],
} as const;

const HORIZONS_AT_EPOCH = {
  mercury: { position: [-0.13009, -0.44729, -0.0246], tolerance: 0.001 },
  venus: { position: [-0.7183, -0.03265, 0.04101], tolerance: 0.001 },
  earth: { position: [-0.17716, 0.96722, 0], tolerance: 0.001 },
  mars: { position: [1.39072, -0.01342, -0.03447], tolerance: 0.001 },
  jupiter: { position: [4.00118, 2.93858, -0.10179], tolerance: 0.02 },
  saturn: { position: [6.40641, 6.56999, -0.36908], tolerance: 0.05 },
  uranus: { position: [14.43186, -13.73432, -0.23814], tolerance: 0.02 },
  neptune: { position: [16.81205, -24.99176, 0.12722], tolerance: 0.02 },
} as const;

const EXTRA_POINTS = [
  ['earth', 182.63, [0.18607, -0.99953, 0]],
  ['earth', 91.315, [-0.97632, -0.21429, 0]],
  ['mars', 343.49, [-1.64352, 0.22331, 0.04507]],
  ['mercury', 22, [0.31119, -0.26172, -0.04994]],
  ['jupiter', 1000, [-2.85515, 4.42916, 0.04559]],
  ['neptune', -30000, [-17.8293, 24.16344, -0.08672]],
] as const;

const ECCENTRICITIES = [0, 0.2, 0.5, 0.9, 0.99, 0.999] as const;

function orbit(overrides: Partial<OrbitDef> = {}): OrbitDef {
  return {
    semiMajorAxisAu: 1,
    eccentricity: 0,
    inclinationDeg: 0,
    longitudeAscendingNodeDeg: 0,
    argumentPeriapsisDeg: 0,
    meanAnomalyAtEpochDeg: 0,
    epoch: 'J2000',
    periodDays: 365.25,
    ...overrides,
  };
}

function body(
  type: BodyType,
  id: string,
  bodyOrbit: OrbitDef | undefined,
): BodyDef {
  return {
    id,
    name: id,
    type,
    parentId: type === 'star' ? null : 'sun',
    radiusKm: 1,
    rotation: { periodHours: 24, axialTiltDeg: 0 },
    visual: { texture: null, color: '#ffffff' },
    contentKey: id,
    orbit: bodyOrbit,
  };
}

function position(
  def: BodyDef,
  days: number,
): { x: number; y: number; z: number } {
  return bodyPositionAu(def, days, { x: 0, y: 0, z: 0 });
}

function distanceBetween(
  actual: { x: number; y: number; z: number },
  expected: readonly [number, number, number],
): number {
  return Math.hypot(
    actual.x - expected[0],
    actual.y - expected[1],
    actual.z - expected[2],
  );
}

function principalDifference(left: number, right: number): number {
  const delta = left - right;
  return Math.atan2(Math.sin(delta), Math.cos(delta));
}

test.each([
  [1, 0.9, 1.862086687],
  [0.1, 0.9, 0.630843528],
  [3, 0.9, 3.067037497],
  [-1, 0.9, -1.862086687],
  [0.5, 0, 0.5],
  [Math.PI, 0.3, Math.PI],
] as const)(
  'solveKepler › reference values (%s, %s)',
  (meanAnomaly, eccentricity, expected) => {
    expect(
      Math.abs(solveKepler(meanAnomaly, eccentricity) - expected),
    ).toBeLessThanOrEqual(1e-9);
  },
);

test('solveKepler › residual on a grid', () => {
  const samples = new Set<number>([-Math.PI, 0, Math.PI]);
  for (let meanAnomaly = -Math.PI; meanAnomaly <= Math.PI; meanAnomaly += 0.1) {
    samples.add(meanAnomaly);
  }

  for (const meanAnomaly of samples) {
    for (const eccentricity of ECCENTRICITIES) {
      const eccentricAnomaly = solveKepler(meanAnomaly, eccentricity);
      const solved =
        eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly);
      expect(Math.abs(principalDifference(solved, meanAnomaly))).toBeLessThan(
        1e-9,
      );
      expect(eccentricAnomaly).toBeGreaterThanOrEqual(-Math.PI - 1e-9);
      expect(eccentricAnomaly).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  }
});

test('solveKepler › e = 0', () => {
  expect(solveKepler(0.5, 0)).toBeCloseTo(0.5, 12);
  expect(solveKepler(-Math.PI, 0)).toBeCloseTo(Math.PI, 12);
  expect(solveKepler(3 * Math.PI, 0, 1e-12, 1)).toBeCloseTo(Math.PI, 12);
  expect(solveKepler(-3 * Math.PI, 0, 1e-12, 1)).toBeCloseTo(Math.PI, 12);
});

test.each([
  ['meanAnomalyRad', Number.NaN, 0.1, 1e-10, 50],
  ['meanAnomalyRad', Number.POSITIVE_INFINITY, 0.1, 1e-10, 50],
  ['meanAnomalyRad', Number.NEGATIVE_INFINITY, 0.1, 1e-10, 50],
  ['e', 1, 1, 1e-10, 50],
  ['e', 1, -0.1, 1e-10, 50],
  ['e', 1, Number.NaN, 1e-10, 50],
  ['tolerance', 1, 0.1, 0, 50],
  ['tolerance', 1, 0.1, -1, 50],
  ['tolerance', 1, 0.1, Number.NaN, 50],
  ['tolerance', 1, 0.1, Number.POSITIVE_INFINITY, 50],
  ['maxIterations', 1, 0.1, 1e-10, 0],
  ['maxIterations', 1, 0.1, 1e-10, 1.5],
  ['maxIterations', 1, 0.1, 1e-10, Number.NaN],
] as const)(
  'solveKepler › RangeError %s',
  (parameter, meanAnomaly, eccentricity, tolerance, maxIterations) => {
    const value =
      parameter === 'meanAnomalyRad'
        ? meanAnomaly
        : parameter === 'e'
          ? eccentricity
          : parameter === 'tolerance'
            ? tolerance
            : maxIterations;
    const call = () =>
      solveKepler(meanAnomaly, eccentricity, tolerance, maxIterations);

    expect(call).toThrow(RangeError);
    expect(call).toThrow(`solveKepler: parameter "${parameter}"`);
    expect(call).toThrow(String(value));
  },
);

test('solveKepler › maxIterations', () => {
  const call = () => solveKepler(3, 0.99, 1e-12, 1);

  expect(call).toThrow(Error);
  try {
    call();
  } catch (error) {
    expect(error).not.toBeInstanceOf(RangeError);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) {
      throw error;
    }
    expect(error.message).toContain('M=3');
    expect(error.message).toContain('e=0.99');
    expect(error.message).toContain('1');
  }
});

test('bodyPositionAu › planetary periods', () => {
  for (const id of PLANETS) {
    const def = getBody(id);
    const period = def.orbit?.periodDays;
    if (period === undefined) {
      throw new Error(`missing period: ${id}`);
    }

    const atEpoch = position(def, 0);
    const atPeriod = position(def, period);
    expect(
      distanceBetween(atPeriod, [atEpoch.x, atEpoch.y, atEpoch.z]),
    ).toBeLessThanOrEqual(1e-9);
  }

  const earth = getBody('earth');
  const atEpoch = position(earth, 0);
  expect(
    distanceBetween(position(earth, 365.26), [atEpoch.x, atEpoch.y, atEpoch.z]),
  ).toBeLessThanOrEqual(1e-9);
  expect(
    distanceBetween(position(earth, 365.25), [atEpoch.x, atEpoch.y, atEpoch.z]),
  ).toBeLessThanOrEqual(2e-3);
});

test('bodyPositionAu › distance within bounds', () => {
  const times = new Set<number>([-10_000, 10_000]);
  for (let day = -10_000; day <= 10_000; day += 97) {
    times.add(day);
  }

  for (const id of PLANETS) {
    const def = getBody(id);
    const orbitDef = def.orbit;
    if (orbitDef === undefined) {
      throw new Error(`missing orbit: ${id}`);
    }

    const perihelion = orbitDef.semiMajorAxisAu * (1 - orbitDef.eccentricity);
    const aphelion = orbitDef.semiMajorAxisAu * (1 + orbitDef.eccentricity);
    for (const day of times) {
      const point = position(def, day);
      const radius = Math.hypot(point.x, point.y, point.z);
      expect(radius).toBeGreaterThanOrEqual(perihelion - 1e-9);
      expect(radius).toBeLessThanOrEqual(aphelion + 1e-9);
    }
  }
});

test.each(PLANETS)('bodyPositionAu › t = 0 model %s', (id) => {
  const point = position(getBody(id), 0);
  expect(distanceBetween(point, MODEL_AT_EPOCH[id])).toBeLessThanOrEqual(1e-4);
});

test.each(PLANETS)('bodyPositionAu › t = 0 Horizons %s', (id) => {
  const sample = HORIZONS_AT_EPOCH[id];
  const point = position(getBody(id), 0);
  expect(distanceBetween(point, sample.position)).toBeLessThanOrEqual(
    sample.tolerance,
  );
});

test.each(EXTRA_POINTS)(
  'bodyPositionAu › extra points %s t=%s',
  (id, day, expected) => {
    expect(
      distanceBetween(position(getBody(id), day), expected),
    ).toBeLessThanOrEqual(1e-4);
  },
);

test('bodyPositionAu › Mercury perihelion and aphelion', () => {
  const mercury = getBody('mercury');
  const mercuryOrbit = mercury.orbit;
  if (mercuryOrbit === undefined) {
    throw new Error('Mercury has no orbit');
  }

  const perihelion = position(
    {
      ...mercury,
      orbit: { ...mercuryOrbit, meanAnomalyAtEpochDeg: 0 },
    },
    0,
  );
  const aphelion = position(
    {
      ...mercury,
      orbit: { ...mercuryOrbit, meanAnomalyAtEpochDeg: 180 },
    },
    0,
  );

  expect(
    Math.abs(Math.hypot(perihelion.x, perihelion.y, perihelion.z) - 0.3075),
  ).toBeLessThanOrEqual(1e-5);
  expect(
    Math.abs(Math.hypot(aphelion.x, aphelion.y, aphelion.z) - 0.4667),
  ).toBeLessThanOrEqual(1e-5);
});

test('bodyPositionAu › e = 0.9', () => {
  const def = body(
    'planet',
    'high-e',
    orbit({ eccentricity: 0.9, periodDays: 100 }),
  );

  const start = position(def, 0);
  expect(start.x).toBeCloseTo(0.1, 9);
  expect(start.y).toBeCloseTo(0, 9);
  expect(start.z).toBeCloseTo(0, 9);
  const half = position(def, 50);
  expect(half.x).toBeCloseTo(-1.9, 9);
  expect(half.y).toBeCloseTo(0, 9);
  expect(half.z).toBeCloseTo(0, 9);
});

test.each([
  ['star', 'sun'],
  ['belt', 'belt'],
] as const)('bodyPositionAu › missing orbit %s', (type, id) => {
  const out = { x: 4, y: 5, z: 6 };
  expect(bodyPositionAu(body(type, id, undefined), 0, out)).toBe(out);
  expect(out).toEqual({ x: 0, y: 0, z: 0 });
});

test.each(['planet', 'dwarf', 'moon'] as const)(
  'bodyPositionAu › missing orbit %s throws RangeError',
  (type) => {
    const call = () =>
      bodyPositionAu(body(type, 'missing', undefined), 12, {
        x: 1,
        y: 1,
        z: 1,
      });

    expect(call).toThrow(RangeError);
    expect(call).toThrow('missing');
  },
);

test('bodyPositionAu › moon', () => {
  const moon = body(
    'moon',
    'moon',
    orbit({
      semiMajorAxisAu: 384_400,
      eccentricity: 0.0549,
      periodDays: 27.3217,
    }),
  );

  const near = position(moon, 0);
  const far = position(moon, 27.3217 / 2);
  expect(
    Math.abs(Math.hypot(near.x, near.y, near.z) - 363_296.4),
  ).toBeLessThanOrEqual(0.1);
  expect(
    Math.abs(Math.hypot(far.x, far.y, far.z) - 405_503.6),
  ).toBeLessThanOrEqual(0.1);
});

test('bodyPositionAu › negative days', () => {
  const point = position(getBody('neptune'), -30_000);
  expect(
    distanceBetween(point, [-17.8293, 24.16344, -0.08672]),
  ).toBeLessThanOrEqual(1e-4);
  expect(Number.isFinite(point.x)).toBe(true);
  expect(Number.isFinite(point.y)).toBe(true);
  expect(Number.isFinite(point.z)).toBe(true);
});

test('bodyPositionAu › out', () => {
  const def = getBody('earth');
  const before = structuredClone(def);
  const out = { x: 9, y: 8, z: 7 };

  expect(bodyPositionAu(def, 10, out)).toBe(out);
  expect(def).toEqual(before);
});

test.each([
  ['daysSinceJ2000', Number.NaN, {}],
  ['daysSinceJ2000', Number.POSITIVE_INFINITY, {}],
  ['orbit.periodDays', 0, { periodDays: 0 }],
  ['orbit.periodDays', -1, { periodDays: -1 }],
  ['orbit.periodDays', Number.NaN, { periodDays: Number.NaN }],
  ['orbit.semiMajorAxisAu', 0, { semiMajorAxisAu: 0 }],
  ['orbit.semiMajorAxisAu', -1, { semiMajorAxisAu: -1 }],
  ['orbit.semiMajorAxisAu', Number.NaN, { semiMajorAxisAu: Number.NaN }],
  ['orbit.inclinationDeg', Number.NaN, { inclinationDeg: Number.NaN }],
  ['orbit.eccentricity', 1, { eccentricity: 1 }],
  ['orbit.eccentricity', Number.NaN, { eccentricity: Number.NaN }],
] as const)(
  'bodyPositionAu › RangeError %s = %s',
  (field, value, orbitPatch) => {
    const earth = getBody('earth');
    const earthOrbit = earth.orbit;
    if (earthOrbit === undefined) {
      throw new Error('Earth has no orbit');
    }

    const call = () =>
      bodyPositionAu(
        { ...earth, orbit: { ...earthOrbit, ...orbitPatch } },
        field === 'daysSinceJ2000' ? value : 0,
        { x: 0, y: 0, z: 0 },
      );

    expect(call).toThrow(RangeError);
    expect(call).toThrow(field);
    expect(call).toThrow('earth');
    expect(call).toThrow(String(value));
  },
);
