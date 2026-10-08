import { expect, test } from 'vitest';

import raw from '@data/bodies.json' with { type: 'json' };
import { validateBodies } from '@data/validate.ts';

type Entry = Record<string, unknown>;

function isEntry(value: unknown): value is Entry {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function entries(): Entry[] {
  return structuredClone(raw);
}

function find(list: Entry[], id: string): Entry {
  const entry = list.find((item) => item.id === id);
  if (!entry) {
    throw new Error(`Missing body ${id} in test data`);
  }
  return entry;
}

function group(entry: Entry, key: string): Entry {
  const value = entry[key];
  if (!isEntry(value)) {
    throw new Error(`Field ${key} is not an object`);
  }
  return value;
}

function errorsOf(input: unknown): string[] {
  const result = validateBodies(input);
  if (result.ok) {
    throw new Error('Validation was expected to fail');
  }
  return result.errors;
}

test('accepts the sun, eight planets, and five moons', () => {
  const result = validateBodies(structuredClone(raw));

  expect(result.ok).toBe(true);
  expect(result.ok && result.bodies).toHaveLength(14);
  expect(result.ok && result.bodies.map((body) => body.id)).toEqual([
    'sun',
    'mercury',
    'venus',
    'earth',
    'moon',
    'mars',
    'jupiter',
    'io',
    'europa',
    'ganymede',
    'callisto',
    'saturn',
    'uranus',
    'neptune',
  ]);
});

test('names the id and field of a missing value', () => {
  const list = entries();
  delete group(find(list, 'mercury'), 'orbit').eccentricity;

  expect(errorsOf(list)).toEqual(['mercury: missing field orbit.eccentricity']);
});

test('rejects a parentId that points to no body', () => {
  const list = entries();
  find(list, 'mars').parentId = 'phobos';

  expect(errorsOf(list)).toEqual([
    'mars: field parentId points to a missing body "phobos"',
  ]);
});

test('rejects a parent cycle', () => {
  const list = entries();
  find(list, 'mercury').parentId = 'venus';
  find(list, 'venus').parentId = 'mercury';

  expect(errorsOf(list)).toEqual([
    'mercury: field parentId forms a cycle (mercury → venus → mercury)',
    'venus: field parentId forms a cycle (venus → mercury → venus)',
  ]);
});

test('rejects two bodies with the same id', () => {
  const list = entries();
  find(list, 'venus').id = 'mercury';

  expect(errorsOf(list)).toContain('mercury: field id is duplicated');
});

test('rejects data without a root', () => {
  const list = entries().filter((entry) => entry.id !== 'sun');
  const errors = errorsOf(list);

  expect(errors).toContain(
    'There must be exactly one root (a body with parentId: null), found 0',
  );
});

test('rejects two roots', () => {
  const list = entries();
  find(list, 'jupiter').parentId = null;

  expect(errorsOf(list)).toEqual([
    'There must be exactly one root (a body with parentId: null), found 2',
    "jupiter: root must have type: 'star'",
    'jupiter: root must not have an orbit field',
  ]);
});

test('rejects an eccentricity of 1', () => {
  const list = entries();
  group(find(list, 'neptune'), 'orbit').eccentricity = 1;

  expect(errorsOf(list)).toEqual([
    'neptune: field orbit.eccentricity must be in the range [0, 1)',
  ]);
});

test('rejects a color that is not #rrggbb', () => {
  const list = entries();
  group(find(list, 'mars'), 'visual').color = 'red';

  expect(errorsOf(list)).toEqual([
    'mars: field visual.color must match #rrggbb',
  ]);
});

test('requires an orbit for every body that is not a star', () => {
  const list = entries();
  delete find(list, 'earth').orbit;

  expect(errorsOf(list)).toEqual(['earth: missing field orbit']);
});

function beltEntry(list: Entry[]): Entry {
  const belt = structuredClone(find(list, 'mars'));
  belt.id = 'asteroid-belt';
  belt.name = 'Asteroid belt';
  belt.type = 'belt';
  belt.contentKey = 'asteroid-belt';
  return belt;
}

test('validate › belt without orbit', () => {
  const withoutOrbit = entries();
  const belt = beltEntry(withoutOrbit);
  delete belt.orbit;
  withoutOrbit.push(belt);
  const result = validateBodies(withoutOrbit);
  expect(result.ok).toBe(true);
  expect(
    result.ok && result.bodies.find((body) => body.id === 'asteroid-belt'),
  ).toMatchObject({ type: 'belt' });

  const withOrbit = entries();
  withOrbit.push(beltEntry(withOrbit));
  expect(validateBodies(withOrbit).ok).toBe(true);

  const brokenOrbit = entries();
  const brokenBelt = beltEntry(brokenOrbit);
  group(brokenBelt, 'orbit').eccentricity = 1;
  brokenOrbit.push(brokenBelt);
  expect(errorsOf(brokenOrbit)).toEqual([
    'asteroid-belt: field orbit.eccentricity must be in the range [0, 1)',
  ]);
});

test.each([
  ['planet', 'earth'],
  ['dwarf', 'mars'],
  ['moon', 'moon'],
])('validate › orbit required for a %s', (type, id) => {
  const list = entries();
  const body = find(list, id);
  body.type = type;
  delete body.orbit;

  expect(errorsOf(list)).toEqual([`${id}: missing field orbit`]);
});

test('reports every broken field of one body', () => {
  const list = entries();
  const saturn = find(list, 'saturn');
  saturn.id = 'Saturn';
  saturn.type = 'comet';
  saturn.radiusKm = 0;
  saturn.mass = '568';
  group(saturn, 'rotation').axialTiltDeg = 181;
  group(saturn, 'orbit').epoch = 'J2050';
  saturn.visual = 'yellow';

  expect(errorsOf(list)).toEqual([
    'Saturn: field id may contain only lowercase letters, digits, and hyphens',
    'Saturn: field type must be one of: star, planet, dwarf, moon, belt',
    'Saturn: field radiusKm must be greater than 0',
    'Saturn: field mass must be a number',
    'Saturn: field orbit.epoch must be J2000',
    'Saturn: field rotation.axialTiltDeg must be in the range [0, 180]',
    'Saturn: field visual must be an object',
  ]);
});

test('validate › moons › a star, a belt, or another moon cannot be the parent', () => {
  const starParent = entries();
  find(starParent, 'moon').parentId = 'sun';
  expect(errorsOf(starParent)).toEqual([
    'moon: field parentId must reference an earlier planet or dwarf, got "sun"',
  ]);

  const moonParent = entries();
  find(moonParent, 'europa').parentId = 'io';
  expect(errorsOf(moonParent)).toEqual([
    'europa: field parentId must reference an earlier planet or dwarf, got "io"',
  ]);

  const beltParent = entries();
  const belt = structuredClone(find(beltParent, 'mars'));
  belt.id = 'asteroids';
  belt.name = 'Asteroids';
  belt.type = 'belt';
  belt.contentKey = 'asteroids';
  const earthIndex = beltParent.findIndex((entry) => entry.id === 'earth');
  beltParent.splice(earthIndex + 1, 0, belt);
  find(beltParent, 'moon').parentId = 'asteroids';
  expect(errorsOf(beltParent)).toEqual([
    'moon: field parentId must reference an earlier planet or dwarf, got "asteroids"',
  ]);
});

test('validate › moons › a moon must follow its parent', () => {
  const list = entries();
  const moonIndex = list.findIndex((entry) => entry.id === 'moon');
  const moon = list[moonIndex];
  if (moon === undefined) {
    throw new Error('Missing moon');
  }
  list.splice(moonIndex, 1);
  list.splice(1, 0, moon);

  expect(errorsOf(list)).toEqual([
    'moon: field parentId must reference an earlier planet or dwarf, got "earth"',
  ]);
});

test('validate › moons › a missing planet parent names the field', () => {
  const list = entries();
  find(list, 'moon').parentId = null;

  expect(errorsOf(list)).toEqual([
    'There must be exactly one root (a body with parentId: null), found 2',
    "moon: root must have type: 'star'",
    'moon: root must not have an orbit field',
    'moon: field parentId must reference an earlier planet or dwarf, got null',
  ]);
});

test('validate › moon semiMajorAxisKm', () => {
  const list = entries();
  const moonOrbit = group(find(list, 'moon'), 'orbit');
  expect(moonOrbit.semiMajorAxisKm).toBe(384400);
  expect(moonOrbit).not.toHaveProperty('semiMajorAxisAu');
  expect(validateBodies(list).ok).toBe(true);

  const missing = entries();
  delete group(find(missing, 'moon'), 'orbit').semiMajorAxisKm;
  expect(errorsOf(missing)).toEqual([
    'moon: missing field orbit.semiMajorAxisKm',
  ]);

  for (const value of [0, -1, Number.NaN]) {
    const broken = entries();
    group(find(broken, 'moon'), 'orbit').semiMajorAxisKm = value;
    expect(errorsOf(broken)[0]).toMatch(/^moon: field orbit\.semiMajorAxisKm /);
  }
});

test('validate › moons › each axis field belongs to its body type', () => {
  const moonWithAu = entries();
  const moonOrbit = group(find(moonWithAu, 'moon'), 'orbit');
  moonOrbit.semiMajorAxisAu = moonOrbit.semiMajorAxisKm;
  delete moonOrbit.semiMajorAxisKm;
  expect(errorsOf(moonWithAu)).toEqual([
    'moon: missing field orbit.semiMajorAxisKm',
    'moon: field orbit.semiMajorAxisAu is not allowed for a moon, use orbit.semiMajorAxisKm',
  ]);

  const planetWithKm = entries();
  group(find(planetWithKm, 'neptune'), 'orbit').semiMajorAxisKm = 4_500_000_000;
  expect(errorsOf(planetWithKm)).toEqual([
    'neptune: field orbit.semiMajorAxisKm is allowed only for a moon, use orbit.semiMajorAxisAu',
  ]);
});

test('validate › moons › axis units stay on their own side of 1000', () => {
  const moonList = entries();
  group(find(moonList, 'moon'), 'orbit').semiMajorAxisKm = 0.00257;
  expect(errorsOf(moonList)).toEqual([
    'moon: field orbit.semiMajorAxisKm must be >= 1000 (km), got 0.00257',
  ]);

  const planetList = entries();
  group(find(planetList, 'neptune'), 'orbit').semiMajorAxisAu = 1500;
  expect(errorsOf(planetList)).toEqual([
    'neptune: field orbit.semiMajorAxisAu must be < 1000 (AU), got 1500',
  ]);
});

test('validate › moons › a dwarf parent that appears earlier is allowed', () => {
  const list = entries();
  const dwarf = structuredClone(find(list, 'mars'));
  dwarf.id = 'ceres';
  dwarf.name = 'Ceres';
  dwarf.type = 'dwarf';
  dwarf.contentKey = 'ceres';
  const earthIndex = list.findIndex((entry) => entry.id === 'earth');
  list.splice(earthIndex + 1, 0, dwarf);
  find(list, 'moon').parentId = 'ceres';

  expect(validateBodies(list).ok).toBe(true);
});

test('rejects input that is not a list of objects', () => {
  expect(errorsOf({ bodies: [] })).toEqual(['Body data must be an array']);
  expect(errorsOf([null])).toEqual(['Body #1: entry must be an object']);
});

test.each<[string, (ring: Entry) => void, string]>([
  [
    'inner radius inside the planet',
    (ring) => {
      ring.innerRadiusKm = 58_232;
    },
    'saturn: field visual.ring.innerRadiusKm must be > radiusKm (58232), got 58232',
  ],
  [
    'outer radius below the inner radius',
    (ring) => {
      ring.outerRadiusKm = 70_000;
    },
    'saturn: field visual.ring.outerRadiusKm must be > visual.ring.innerRadiusKm (74500), got 70000',
  ],
  [
    'outer radius equal to the inner radius',
    (ring) => {
      ring.outerRadiusKm = 74_500;
    },
    'saturn: field visual.ring.outerRadiusKm must be > visual.ring.innerRadiusKm (74500), got 74500',
  ],
  [
    'NaN inner radius',
    (ring) => {
      ring.innerRadiusKm = Number.NaN;
    },
    'saturn: field visual.ring.innerRadiusKm must be a number',
  ],
  [
    'infinite outer radius',
    (ring) => {
      ring.outerRadiusKm = Number.POSITIVE_INFINITY;
    },
    'saturn: field visual.ring.outerRadiusKm must be a number',
  ],
  [
    'negative outer radius',
    (ring) => {
      ring.outerRadiusKm = -1;
    },
    'saturn: field visual.ring.outerRadiusKm must be greater than 0',
  ],
  [
    'zero inner radius',
    (ring) => {
      ring.innerRadiusKm = 0;
    },
    'saturn: field visual.ring.innerRadiusKm must be greater than 0',
  ],
  [
    'missing outer radius',
    (ring) => {
      delete ring.outerRadiusKm;
    },
    'saturn: missing field visual.ring.outerRadiusKm',
  ],
  [
    'texture of the wrong type',
    (ring) => {
      ring.texture = 42;
    },
    'saturn: field visual.ring.texture must be a non-empty string or null',
  ],
  [
    'missing texture',
    (ring) => {
      delete ring.texture;
    },
    'saturn: missing field visual.ring.texture',
  ],
])('validate › rejects invalid ring: %s', (_name, breakRing, message) => {
  const list = entries();
  breakRing(group(group(find(list, 'saturn'), 'visual'), 'ring'));

  expect(errorsOf(list)).toEqual([message]);
});

test('validate › ring must be an object', () => {
  const list = entries();
  group(find(list, 'saturn'), 'visual').ring = 'rings';

  expect(errorsOf(list)).toEqual([
    'saturn: field visual.ring must be an object',
  ]);
});

test('validate › ring texture may be a file name', () => {
  const list = entries();
  group(group(find(list, 'saturn'), 'visual'), 'ring').texture =
    '2k_saturn_ring_alpha.png';

  expect(validateBodies(list).ok).toBe(true);
});

test.each(['Jupiter', 'jupiter/2k', 'jupiter.jpg', '', 42])(
  'validate › rejects texture key %j',
  (texture) => {
    const list = entries();
    group(find(list, 'jupiter'), 'visual').texture = texture;

    expect(errorsOf(list)).toEqual([
      'jupiter: field visual.texture must be null or match ^[a-z0-9-]+$',
    ]);
  },
);

test('validate › texture key may be null', () => {
  const list = entries();
  group(find(list, 'jupiter'), 'visual').texture = null;

  expect(validateBodies(list).ok).toBe(true);
});
