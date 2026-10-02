import { expect, test } from 'vitest';

import { bodies, getBody } from '@data/bodies.ts';

const PLANETS = [
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
];

// Written out here rather than read from bodies.json, so a data change fails the test.
const NAMES = [
  ['sun', 'Sun'],
  ['mercury', 'Mercury'],
  ['venus', 'Venus'],
  ['earth', 'Earth'],
  ['moon', 'Moon'],
  ['mars', 'Mars'],
  ['jupiter', 'Jupiter'],
  ['io', 'Io'],
  ['europa', 'Europa'],
  ['ganymede', 'Ganymede'],
  ['callisto', 'Callisto'],
  ['saturn', 'Saturn'],
  ['uranus', 'Uranus'],
  ['neptune', 'Neptune'],
] as const;

const MOON_IDS = ['moon', 'io', 'europa', 'ganymede', 'callisto'] as const;

test.each(NAMES)('bodies › names › %s is %s', (id, name) => {
  expect(getBody(id).name).toBe(name);
});

// Every number in bodies.json, typed in by hand from the EMI-102 tables (JPL
// Table 1 for orbits, NSSDCA fact sheets for the rest). Compared as numbers,
// because Prettier drops trailing zeros (0.330 → 0.33).
const VALUES: Record<string, object> = {
  sun: {
    radiusKm: 695700,
    mass: 1988400,
    rotation: { periodHours: 609.12, axialTiltDeg: 7.25 },
  },
  mercury: {
    radiusKm: 2439.7,
    mass: 0.33,
    orbit: {
      semiMajorAxisAu: 0.38709927,
      eccentricity: 0.20563593,
      inclinationDeg: 7.00497902,
      longitudeAscendingNodeDeg: 48.33076593,
      argumentPeriapsisDeg: 29.12703,
      meanAnomalyAtEpochDeg: 174.79253,
      periodDays: 87.97,
    },
    rotation: { periodHours: 1407.6, axialTiltDeg: 0.034 },
  },
  venus: {
    radiusKm: 6051.8,
    mass: 4.87,
    orbit: {
      semiMajorAxisAu: 0.72333566,
      eccentricity: 0.00677672,
      inclinationDeg: 3.39467605,
      longitudeAscendingNodeDeg: 76.67984255,
      argumentPeriapsisDeg: 54.92262,
      meanAnomalyAtEpochDeg: 50.37663,
      periodDays: 224.7,
    },
    rotation: { periodHours: 5832.6, axialTiltDeg: 177.36 },
  },
  earth: {
    radiusKm: 6371,
    mass: 5.97,
    orbit: {
      semiMajorAxisAu: 1.00000261,
      eccentricity: 0.01671123,
      inclinationDeg: 0,
      longitudeAscendingNodeDeg: 0,
      argumentPeriapsisDeg: 102.93768,
      meanAnomalyAtEpochDeg: 357.52689,
      periodDays: 365.26,
    },
    rotation: { periodHours: 23.9345, axialTiltDeg: 23.44 },
  },
  mars: {
    radiusKm: 3389.5,
    mass: 0.642,
    orbit: {
      semiMajorAxisAu: 1.52371034,
      eccentricity: 0.0933941,
      inclinationDeg: 1.84969142,
      longitudeAscendingNodeDeg: 49.55953891,
      argumentPeriapsisDeg: 286.49683,
      meanAnomalyAtEpochDeg: 19.3902,
      periodDays: 686.98,
    },
    rotation: { periodHours: 24.6229, axialTiltDeg: 25.19 },
  },
  jupiter: {
    radiusKm: 69911,
    mass: 1898,
    orbit: {
      semiMajorAxisAu: 5.202887,
      eccentricity: 0.04838624,
      inclinationDeg: 1.30439695,
      longitudeAscendingNodeDeg: 100.47390909,
      argumentPeriapsisDeg: 274.25457,
      meanAnomalyAtEpochDeg: 19.66796,
      periodDays: 4332.82,
    },
    rotation: { periodHours: 9.925, axialTiltDeg: 3.13 },
  },
  saturn: {
    radiusKm: 58232,
    mass: 568,
    orbit: {
      semiMajorAxisAu: 9.53667594,
      eccentricity: 0.05386179,
      inclinationDeg: 2.48599187,
      longitudeAscendingNodeDeg: 113.66242448,
      argumentPeriapsisDeg: 338.93645,
      meanAnomalyAtEpochDeg: 317.35537,
      periodDays: 10755.88,
    },
    rotation: { periodHours: 10.656, axialTiltDeg: 26.73 },
  },
  uranus: {
    radiusKm: 25362,
    mass: 86.8,
    orbit: {
      semiMajorAxisAu: 19.18916464,
      eccentricity: 0.04725744,
      inclinationDeg: 0.77263783,
      longitudeAscendingNodeDeg: 74.01692503,
      argumentPeriapsisDeg: 96.93735,
      meanAnomalyAtEpochDeg: 142.28383,
      periodDays: 30687.4,
    },
    rotation: { periodHours: 17.24, axialTiltDeg: 97.77 },
  },
  neptune: {
    radiusKm: 24622,
    mass: 102,
    orbit: {
      semiMajorAxisAu: 30.06992276,
      eccentricity: 0.00859048,
      inclinationDeg: 1.77004347,
      longitudeAscendingNodeDeg: 131.78422574,
      argumentPeriapsisDeg: 273.18054,
      meanAnomalyAtEpochDeg: 259.91521,
      periodDays: 60189.66,
    },
    rotation: { periodHours: 16.11, axialTiltDeg: 28.32 },
  },
  moon: {
    radiusKm: 1737.4,
    mass: 0.07346,
    orbit: {
      semiMajorAxisAu: 384400,
      eccentricity: 0.0554,
      inclinationDeg: 5.16,
      longitudeAscendingNodeDeg: 125.08,
      argumentPeriapsisDeg: 318.15,
      meanAnomalyAtEpochDeg: 135.27,
      periodDays: 27.322,
    },
    rotation: { periodHours: 655.72, axialTiltDeg: 6.68 },
  },
  io: {
    radiusKm: 1821.5,
    mass: 0.08932,
    orbit: {
      semiMajorAxisAu: 421800,
      eccentricity: 0.004,
      inclinationDeg: 0,
      longitudeAscendingNodeDeg: 0,
      argumentPeriapsisDeg: 49.1,
      meanAnomalyAtEpochDeg: 330.9,
      periodDays: 1.762732,
    },
    rotation: { periodHours: 42.306, axialTiltDeg: 0 },
  },
  europa: {
    radiusKm: 1560.8,
    mass: 0.048,
    orbit: {
      semiMajorAxisAu: 671100,
      eccentricity: 0.009,
      inclinationDeg: 0.5,
      longitudeAscendingNodeDeg: 184,
      argumentPeriapsisDeg: 45,
      meanAnomalyAtEpochDeg: 345.4,
      periodDays: 3.525463,
    },
    rotation: { periodHours: 84.611, axialTiltDeg: 0 },
  },
  ganymede: {
    radiusKm: 2631.2,
    mass: 0.14819,
    orbit: {
      semiMajorAxisAu: 1070400,
      eccentricity: 0.001,
      inclinationDeg: 0.2,
      longitudeAscendingNodeDeg: 58.5,
      argumentPeriapsisDeg: 198.3,
      meanAnomalyAtEpochDeg: 324.8,
      periodDays: 7.155588,
    },
    rotation: { periodHours: 171.734, axialTiltDeg: 0 },
  },
  callisto: {
    radiusKm: 2410.3,
    mass: 0.10759,
    orbit: {
      semiMajorAxisAu: 1882700,
      eccentricity: 0.007,
      inclinationDeg: 0.3,
      longitudeAscendingNodeDeg: 309.1,
      argumentPeriapsisDeg: 43.8,
      meanAnomalyAtEpochDeg: 87.4,
      periodDays: 16.69044,
    },
    rotation: { periodHours: 400.571, axialTiltDeg: 0 },
  },
};

function numericLeaves(value: unknown, prefix = ''): [string, number][] {
  if (typeof value === 'number') {
    return [[prefix, value]];
  }
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    numericLeaves(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

const VALUE_CASES = Object.entries(VALUES).flatMap(([id, values]) =>
  numericLeaves(values).map(
    ([path, expected]) => [id, path, expected] as const,
  ),
);

test('bodies › values › the table holds 147 numbers', () => {
  expect(VALUE_CASES).toHaveLength(147);
});

test.each(
  VALUE_CASES.filter(([id]) => (MOON_IDS as readonly string[]).includes(id)),
)('bodies › moon values › %s %s is %s', (id, path, expected) => {
  const actual = new Map(numericLeaves(getBody(id))).get(path);
  expect(actual).toBe(expected);
});

test.each(VALUE_CASES)(
  'bodies › values › %s %s is %s',
  (id, path, expected) => {
    const actual = new Map(numericLeaves(getBody(id))).get(path);
    expect(actual).toBe(expected);
  },
);

test.each(bodies.map((body) => [body.id, body] as const))(
  'bodies › values › every number of %s is in the table',
  (id, body) => {
    const paths = (value: unknown) =>
      numericLeaves(value)
        .map(([path]) => path)
        .sort();
    expect(paths(body)).toEqual(paths(VALUES[id]));
  },
);

test('holds the sun, eight planets, and five moons', () => {
  expect(bodies).toHaveLength(14);
  expect(bodies[0]?.id).toBe('sun');
});

test('bodies › moons', () => {
  expect(bodies).toHaveLength(14);

  const moon = getBody('moon');
  expect(moon.parentId).toBe('earth');
  expect(moon.type).toBe('moon');
  expect(moon.name).toBe('Moon');
  expect(moon.contentKey).toBe('moon');

  for (const id of ['io', 'europa', 'ganymede', 'callisto'] as const) {
    const body = getBody(id);
    expect(body.parentId).toBe('jupiter');
    expect(body.type).toBe('moon');
    expect(body.contentKey).toBe(id);
  }

  expect(getBody('io').name).toBe('Io');
  expect(getBody('europa').name).toBe('Europa');
  expect(getBody('ganymede').name).toBe('Ganymede');
  expect(getBody('callisto').name).toBe('Callisto');

  const indexOf = (id: string) => bodies.findIndex((body) => body.id === id);
  expect(indexOf('moon')).toBeGreaterThan(indexOf('earth'));
  expect(indexOf('io')).toBeGreaterThan(indexOf('jupiter'));
  expect(indexOf('europa')).toBeGreaterThan(indexOf('io'));
  expect(indexOf('ganymede')).toBeGreaterThan(indexOf('europa'));
  expect(indexOf('callisto')).toBeGreaterThan(indexOf('ganymede'));
  expect(indexOf('saturn')).toBeGreaterThan(indexOf('callisto'));
});

test('gives the Earth a year of about 365.26 days', () => {
  expect(getBody('earth').orbit?.periodDays).toBeCloseTo(365.26, 2);
});

test('marks Venus as rotating backwards through its axial tilt', () => {
  expect(getBody('venus').rotation.axialTiltDeg).toBeGreaterThan(90);
});

test('puts every planet on an orbit around the sun', () => {
  for (const id of PLANETS) {
    expect(getBody(id).parentId).toBe('sun');
  }
});

test('lengthens orbital periods from Mercury to Neptune', () => {
  const periods = PLANETS.map((id) => getBody(id).orbit?.periodDays ?? 0);

  expect(periods).toEqual([...periods].sort((a, b) => a - b));
  expect(new Set(periods).size).toBe(PLANETS.length);
});

test('throws for an unknown id', () => {
  expect(() => getBody('pluto')).toThrow('Unknown celestial body: pluto');
});
