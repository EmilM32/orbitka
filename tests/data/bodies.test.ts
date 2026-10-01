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

test('holds the sun and eight planets', () => {
  expect(bodies).toHaveLength(9);
  expect(bodies[0]?.id).toBe('sun');
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
  expect(() => getBody('pluto')).toThrow('Nieznane ciało niebieskie: pluto');
});
