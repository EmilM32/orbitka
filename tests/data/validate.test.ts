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

test('validate › moons › axis units stay on their own side of 1000', () => {
  const moonList = entries();
  group(find(moonList, 'moon'), 'orbit').semiMajorAxisAu = 0.00257;
  expect(errorsOf(moonList)).toEqual([
    'moon: field orbit.semiMajorAxisAu must be >= 1000 (km for a moon), got 0.00257',
  ]);

  const planetList = entries();
  group(find(planetList, 'neptune'), 'orbit').semiMajorAxisAu = 1500;
  expect(errorsOf(planetList)).toEqual([
    'neptune: field orbit.semiMajorAxisAu must be < 1000 (AU for a body that is not a moon), got 1500',
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
