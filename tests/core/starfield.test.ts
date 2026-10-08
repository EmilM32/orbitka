import { expect, test } from 'vitest';

import {
  STARFIELD_SEED,
  STAR_COUNTS,
  generateStarfield,
} from '@core/starfield.ts';

const RADIUS = 1800;

test('starfield › golden values', () => {
  expect(STAR_COUNTS).toEqual({ high: 4000, medium: 2500, low: 1200 });
  expect(STARFIELD_SEED).toBe(20261007);
});

test('starfield › same seed gives same stars', () => {
  const first = generateStarfield(500, STARFIELD_SEED, RADIUS);
  const second = generateStarfield(500, STARFIELD_SEED, RADIUS);
  expect(second.positions).toEqual(first.positions);
  expect(second.sizes).toEqual(first.sizes);
  expect(second.brightness).toEqual(first.brightness);

  const other = generateStarfield(500, STARFIELD_SEED + 1, RADIUS);
  expect(other.positions).not.toEqual(first.positions);
  expect(other.brightness).not.toEqual(first.brightness);
});

test('starfield › a smaller field is the start of a bigger one', () => {
  const small = generateStarfield(STAR_COUNTS.low, STARFIELD_SEED, RADIUS);
  const big = generateStarfield(STAR_COUNTS.high, STARFIELD_SEED, RADIUS);
  expect(big.positions.subarray(0, small.positions.length)).toEqual(
    small.positions,
  );
  expect(big.sizes.subarray(0, small.sizes.length)).toEqual(small.sizes);
});

test('starfield › points lie on the sphere', () => {
  const { positions } = generateStarfield(
    STAR_COUNTS.high,
    STARFIELD_SEED,
    RADIUS,
  );
  expect(positions).toHaveLength(STAR_COUNTS.high * 3);
  for (let index = 0; index < STAR_COUNTS.high; index += 1) {
    const length = Math.hypot(
      positions[index * 3] ?? 0,
      positions[index * 3 + 1] ?? 0,
      positions[index * 3 + 2] ?? 0,
    );
    expect(Math.abs(length - RADIUS)).toBeLessThanOrEqual(1e-6 * RADIUS);
  }
});

test('starfield › hemispheres are balanced', () => {
  const { positions } = generateStarfield(4000, STARFIELD_SEED, RADIUS);
  for (const axis of [0, 1, 2]) {
    let positive = 0;
    for (let index = 0; index < 4000; index += 1) {
      if ((positions[index * 3 + axis] ?? 0) > 0) {
        positive += 1;
      }
    }
    expect(positive).toBeGreaterThanOrEqual(1900);
    expect(positive).toBeLessThanOrEqual(2100);
  }
});

test('starfield › brightness and size ranges', () => {
  const { sizes, brightness } = generateStarfield(
    STAR_COUNTS.high,
    STARFIELD_SEED,
    RADIUS,
  );
  expect(sizes).toHaveLength(STAR_COUNTS.high);
  expect(brightness).toHaveLength(STAR_COUNTS.high);
  let dim = 0;
  for (let index = 0; index < STAR_COUNTS.high; index += 1) {
    const value = brightness[index] ?? Number.NaN;
    const size = sizes[index] ?? Number.NaN;
    // Float32 rounds 0.35 down a little.
    expect(value).toBeGreaterThanOrEqual(Math.fround(0.35));
    expect(value).toBeLessThanOrEqual(1);
    expect(size).toBeGreaterThanOrEqual(1);
    expect(size).toBeLessThanOrEqual(2.5);
    if (value < 0.675) {
      dim += 1;
    }
  }
  // 0.35 + 0.65·w³ < 0.675 for w < 0.79: most stars are dim.
  expect(dim / STAR_COUNTS.high).toBeGreaterThan(0.7);
});

test('starfield › count 0 gives empty arrays', () => {
  const empty = generateStarfield(0, STARFIELD_SEED, RADIUS);
  expect(empty.positions).toHaveLength(0);
  expect(empty.sizes).toHaveLength(0);
  expect(empty.brightness).toHaveLength(0);
});

test.each([
  [
    -1,
    STARFIELD_SEED,
    RADIUS,
    'generateStarfield: parameter "count" must be an integer >= 0, got -1',
  ],
  [
    1.5,
    STARFIELD_SEED,
    RADIUS,
    'generateStarfield: parameter "count" must be an integer >= 0, got 1.5',
  ],
  [
    Number.NaN,
    STARFIELD_SEED,
    RADIUS,
    'generateStarfield: parameter "count" must be an integer >= 0, got NaN',
  ],
  [
    Number.POSITIVE_INFINITY,
    STARFIELD_SEED,
    RADIUS,
    'generateStarfield: parameter "count" must be an integer >= 0, got Infinity',
  ],
  [10, 0.5, RADIUS, 'parameter "seed"'],
  [10, -1, RADIUS, 'parameter "seed"'],
  [10, 2 ** 32, RADIUS, 'parameter "seed"'],
  [10, STARFIELD_SEED, 0, 'parameter "radius"'],
  [10, STARFIELD_SEED, -5, 'parameter "radius"'],
  [10, STARFIELD_SEED, Number.NaN, 'parameter "radius"'],
  [10, STARFIELD_SEED, Number.POSITIVE_INFINITY, 'parameter "radius"'],
])(
  'starfield › rejects invalid input (count %s, seed %s, radius %s)',
  (count, seed, radius, message) => {
    const call = () => generateStarfield(count, seed, radius);
    expect(call).toThrow(RangeError);
    expect(call).toThrow(message);
  },
);
