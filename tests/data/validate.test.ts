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

test('accepts the sun and eight planets', () => {
  const result = validateBodies(structuredClone(raw));

  expect(result.ok).toBe(true);
  expect(result.ok && result.bodies.map((body) => body.id)).toEqual([
    'sun',
    'mercury',
    'venus',
    'earth',
    'mars',
    'jupiter',
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

test('rejects input that is not a list of objects', () => {
  expect(errorsOf({ bodies: [] })).toEqual(['Body data must be an array']);
  expect(errorsOf([null])).toEqual(['Body #1: entry must be an object']);
});
