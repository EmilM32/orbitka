import { expect, test } from 'vitest';

import raw from '@data/bodies.json';
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
    throw new Error(`Brak ciała ${id} w danych testowych`);
  }
  return entry;
}

function group(entry: Entry, key: string): Entry {
  const value = entry[key];
  if (!isEntry(value)) {
    throw new Error(`Pole ${key} nie jest obiektem`);
  }
  return value;
}

function errorsOf(input: unknown): string[] {
  const result = validateBodies(input);
  if (result.ok) {
    throw new Error('Walidacja miała się nie udać');
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

  expect(errorsOf(list)).toEqual(['mercury: brak pola orbit.eccentricity']);
});

test('rejects a parentId that points to no body', () => {
  const list = entries();
  find(list, 'mars').parentId = 'phobos';

  expect(errorsOf(list)).toEqual([
    'mars: pole parentId wskazuje nieistniejące ciało „phobos”',
  ]);
});

test('rejects a parent cycle', () => {
  const list = entries();
  find(list, 'mercury').parentId = 'venus';
  find(list, 'venus').parentId = 'mercury';

  expect(errorsOf(list)).toEqual([
    'mercury: pole parentId tworzy cykl (mercury → venus → mercury)',
    'venus: pole parentId tworzy cykl (venus → mercury → venus)',
  ]);
});

test('rejects two bodies with the same id', () => {
  const list = entries();
  find(list, 'venus').id = 'mercury';

  expect(errorsOf(list)).toContain('mercury: pole id powtarza się');
});

test('rejects data without a root', () => {
  const list = entries().filter((entry) => entry.id !== 'sun');
  const errors = errorsOf(list);

  expect(errors).toContain(
    'Musi być dokładnie jeden korzeń (ciało z parentId: null), a jest 0',
  );
});

test('rejects two roots', () => {
  const list = entries();
  find(list, 'jupiter').parentId = null;

  expect(errorsOf(list)).toEqual([
    'Musi być dokładnie jeden korzeń (ciało z parentId: null), a jest 2',
    "jupiter: korzeń musi mieć type: 'star'",
    'jupiter: korzeń nie może mieć pola orbit',
  ]);
});

test('rejects an eccentricity of 1', () => {
  const list = entries();
  group(find(list, 'neptune'), 'orbit').eccentricity = 1;

  expect(errorsOf(list)).toEqual([
    'neptune: pole orbit.eccentricity musi być w przedziale [0, 1)',
  ]);
});

test('rejects a color that is not #rrggbb', () => {
  const list = entries();
  group(find(list, 'mars'), 'visual').color = 'red';

  expect(errorsOf(list)).toEqual([
    'mars: pole visual.color musi mieć format #rrggbb',
  ]);
});

test('requires an orbit for every body that is not a star', () => {
  const list = entries();
  delete find(list, 'earth').orbit;

  expect(errorsOf(list)).toEqual(['earth: brak pola orbit']);
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
    'Saturn: pole id może zawierać tylko małe litery, cyfry i myślniki',
    'Saturn: pole type musi mieć jedną z wartości: star, planet, dwarf, moon, belt',
    'Saturn: pole radiusKm musi być większe od 0',
    'Saturn: pole mass musi być liczbą',
    'Saturn: pole orbit.epoch musi mieć wartość J2000',
    'Saturn: pole rotation.axialTiltDeg musi być w przedziale [0, 180]',
    'Saturn: pole visual musi być obiektem',
  ]);
});

test('rejects input that is not a list of objects', () => {
  expect(errorsOf({ bodies: [] })).toEqual(['Dane ciał muszą być tablicą']);
  expect(errorsOf([null])).toEqual(['Ciało #1: wpis musi być obiektem']);
});
