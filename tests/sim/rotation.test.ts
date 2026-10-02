import { expect, test } from 'vitest';

import { bodies } from '@data/bodies.ts';
import {
  advanceSpinAngleRad,
  ROTATION_FADE_END_RPS,
  ROTATION_FADE_START_RPS,
  ROTATION_MAX_STEP_SECONDS,
  rotationFadeFactor,
  rotationsPerSecond,
  spinAngleRad,
} from '@sim/rotation.ts';

const TWO_PI = Math.PI * 2;
const EARTH_HOURS = 23.9345;
const JUPITER_HOURS = 9.925;
const SATURN_HOURS = 10.656;

function expectRangeError(
  call: () => void,
  parameter: string,
  value: string,
): void {
  expect(call).toThrow(RangeError);
  expect(call).toThrow(parameter);
  expect(call).toThrow(value);
}

function signedDelta(delta: number): number {
  const turns = delta / TWO_PI;
  let fraction = turns - Math.floor(turns);
  if (fraction >= 1) {
    fraction = 0;
  }
  const wrapped = fraction * TWO_PI;
  return wrapped > Math.PI ? wrapped - TWO_PI : wrapped;
}

function spinningPeriods(): number[] {
  return bodies
    .filter((body) => body.type === 'star' || body.type === 'planet')
    .map((body) => body.rotation.periodHours);
}

test('spinAngleRad › wartości', () => {
  expect(spinAngleRad(0, 24)).toBe(0);
  expect(spinAngleRad(0.25, 24)).toBeCloseTo(Math.PI / 2, 12);
  expect(spinAngleRad(0.5, 24)).toBeCloseTo(Math.PI, 12);
  expect(spinAngleRad(-0.25, 24)).toBeCloseTo((3 * Math.PI) / 2, 12);
  expect(spinAngleRad(JUPITER_HOURS / 48, JUPITER_HOURS)).toBeCloseTo(
    Math.PI,
    9,
  );
  const earthTurn = spinAngleRad(EARTH_HOURS / 24, EARTH_HOURS);
  expect(Math.min(earthTurn, TWO_PI - earthTurn)).toBeLessThan(1e-9);
});

test('spinAngleRad › zakres [0, 2π)', () => {
  const periods = spinningPeriods();
  expect(periods).toHaveLength(9);

  for (const period of periods) {
    for (let day = -10000; day <= 10000; day += 37.3) {
      const angle = spinAngleRad(day, period);
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(TWO_PI);
    }

    expect(spinAngleRad(-1e-20, period)).toBe(0);

    for (let turn = 1; turn <= 5; turn += 1) {
      for (const sign of [1, -1]) {
        const angle = spinAngleRad(sign * turn * (period / 24), period);
        expect(angle).toBeGreaterThanOrEqual(0);
        expect(angle).toBeLessThan(TWO_PI);
      }
    }
  }
});

test('spinAngleRad › RangeError', () => {
  expectRangeError(() => spinAngleRad(Number.NaN, 24), 'daysSinceJ2000', 'NaN');
  expectRangeError(
    () => spinAngleRad(Number.POSITIVE_INFINITY, 24),
    'daysSinceJ2000',
    'Infinity',
  );
  expectRangeError(
    () => spinAngleRad(Number.NEGATIVE_INFINITY, 24),
    'daysSinceJ2000',
    '-Infinity',
  );
  expectRangeError(() => spinAngleRad(0, 0), 'periodHours', '0');
  expectRangeError(() => spinAngleRad(0, -1), 'periodHours', '-1');
  expectRangeError(() => spinAngleRad(0, Number.NaN), 'periodHours', 'NaN');
  expectRangeError(
    () => spinAngleRad(0, Number.POSITIVE_INFINITY),
    'periodHours',
    'Infinity',
  );
});

test('rotationsPerSecond › wartości', () => {
  expect(rotationsPerSecond(1, 24)).toBe(1);
  expect(rotationsPerSecond(-1, 24)).toBe(1);
  expect(rotationsPerSecond(0, 24)).toBe(0);
  expect(Math.abs(rotationsPerSecond(1, EARTH_HOURS) - 1.0027)).toBeLessThan(
    1e-4,
  );
  expect(Math.abs(rotationsPerSecond(1, JUPITER_HOURS) - 2.418)).toBeLessThan(
    1e-3,
  );
});

test('rotationsPerSecond › RangeError', () => {
  expectRangeError(
    () => rotationsPerSecond(Number.NaN, 24),
    'daysPerSecond',
    'NaN',
  );
  expectRangeError(
    () => rotationsPerSecond(Number.POSITIVE_INFINITY, 24),
    'daysPerSecond',
    'Infinity',
  );
  expectRangeError(
    () => rotationsPerSecond(Number.NEGATIVE_INFINITY, 24),
    'daysPerSecond',
    '-Infinity',
  );
  expectRangeError(() => rotationsPerSecond(1, 0), 'periodHours', '0');
  expectRangeError(() => rotationsPerSecond(1, -1), 'periodHours', '-1');
  expectRangeError(
    () => rotationsPerSecond(1, Number.NaN),
    'periodHours',
    'NaN',
  );
  expectRangeError(
    () => rotationsPerSecond(1, Number.POSITIVE_INFINITY),
    'periodHours',
    'Infinity',
  );
});

test('rotation › stałe', () => {
  expect(ROTATION_FADE_START_RPS).toBe(1);
  expect(ROTATION_FADE_END_RPS).toBe(2);
  expect(ROTATION_MAX_STEP_SECONDS).toBe(0.1);
});

test('rotationFadeFactor › wartości', () => {
  expect(rotationFadeFactor(0)).toBe(1);
  expect(rotationFadeFactor(0.5)).toBe(1);
  expect(rotationFadeFactor(1)).toBe(1);
  expect(rotationFadeFactor(1.25)).toBeCloseTo(0.84375, 12);
  expect(rotationFadeFactor(1.5)).toBeCloseTo(0.5, 12);
  expect(rotationFadeFactor(1.75)).toBeCloseTo(0.15625, 12);
  expect(rotationFadeFactor(2)).toBe(0);
  expect(rotationFadeFactor(1000)).toBe(0);
  expect(rotationFadeFactor(24 / 17.24)).toBeCloseTo(0.659, 3);
  expect(rotationFadeFactor(24 / 16.11)).toBeCloseTo(0.515, 3);
  expect(Math.abs(rotationFadeFactor(24 / EARTH_HOURS) - 1)).toBeLessThan(1e-3);
  expect(rotationFadeFactor(24 / JUPITER_HOURS)).toBe(0);
  expect(rotationFadeFactor(24 / SATURN_HOURS)).toBe(0);
});

test('rotationFadeFactor › monotoniczność i ciągłość', () => {
  let previous = rotationFadeFactor(0);
  for (let rps = 0.01; rps <= 5; rps += 0.01) {
    const fade = rotationFadeFactor(Number(rps.toFixed(2)));
    expect(fade).toBeGreaterThanOrEqual(0);
    expect(fade).toBeLessThanOrEqual(1);
    expect(fade).toBeLessThanOrEqual(previous);
    previous = fade;
  }

  // A 0.01 step of this smoothstep moves about 3e-4, so the kink sample is finer.
  const sample = 1e-4;
  for (const boundary of [1, 2]) {
    const left = rotationFadeFactor(boundary - sample);
    const at = rotationFadeFactor(boundary);
    const right = rotationFadeFactor(boundary + sample);
    expect(Math.abs(at - left)).toBeLessThan(1e-4);
    expect(Math.abs(right - at)).toBeLessThan(1e-4);
  }

  const epsilon = 1e-6;
  expect(
    Math.abs(rotationFadeFactor(1 - epsilon) - rotationFadeFactor(1 + epsilon)),
  ).toBeLessThan(1e-9);
});

test('rotationFadeFactor › RangeError', () => {
  expectRangeError(() => rotationFadeFactor(-1), 'rotationsPerSecond', '-1');
  expectRangeError(
    () => rotationFadeFactor(Number.NaN),
    'rotationsPerSecond',
    'NaN',
  );
  expectRangeError(
    () => rotationFadeFactor(Number.POSITIVE_INFINITY),
    'rotationsPerSecond',
    'Infinity',
  );
});

test('advanceSpinAngleRad › brak skoku przy zmianie prędkości', () => {
  const speeds = [1, 10, 365.25, 1];
  let days = 0;
  let angle = spinAngleRad(0, EARTH_HOURS);

  for (const speed of speeds) {
    for (let step = 0; step < 4; step += 1) {
      const nextDays = days + speed * ROTATION_MAX_STEP_SECONDS;
      const next = advanceSpinAngleRad(
        angle,
        days,
        nextDays,
        EARTH_HOURS,
        speed,
      );
      const moved = Math.abs(signedDelta(next - angle));
      const rps = rotationsPerSecond(speed, EARTH_HOURS);
      const fade = rotationFadeFactor(rps);
      expect(moved).toBeLessThanOrEqual(rps * 0.1 * TWO_PI * fade + 1e-9);
      angle = next;
      days = nextDays;
    }
  }
});

test('advanceSpinAngleRad › fade=1 odtwarza spinAngleRad', () => {
  let days = 0;
  let angle = spinAngleRad(0, EARTH_HOURS);

  for (let step = 0; step < 1000; step += 1) {
    const nextDays = days + 0.01;
    angle = advanceSpinAngleRad(angle, days, nextDays, EARTH_HOURS, 0.1);
    days = nextDays;
  }

  expect(
    Math.abs(signedDelta(angle - spinAngleRad(days, EARTH_HOURS))),
  ).toBeLessThan(1e-6);
});

test('advanceSpinAngleRad › pauza i cofanie', () => {
  expect(advanceSpinAngleRad(1.25, 4, 4, 24, 0)).toBeCloseTo(1.25, 12);
  expect(advanceSpinAngleRad(1.25 + TWO_PI, 4, 4, 24, 0)).toBeCloseTo(1.25, 12);
  expect(advanceSpinAngleRad(-0.5, 4, 4, 24, 0)).toBeCloseTo(TWO_PI - 0.5, 12);

  const prevDays = 10.5;
  const days = 10.4;
  const before = spinAngleRad(prevDays, 24);
  const after = advanceSpinAngleRad(before, prevDays, days, 24, -1);
  const moved = signedDelta(after - before);
  const fullStep = signedDelta(
    spinAngleRad(days, 24) - spinAngleRad(prevDays, 24),
  );
  expect(moved).toBeLessThan(0);
  expect(moved).toBeCloseTo(fullStep, 12);
});

test('advanceSpinAngleRad › skok', () => {
  expect(advanceSpinAngleRad(0.4, 0, 1000, 24, 1)).toBe(spinAngleRad(1000, 24));
});

test('advanceSpinAngleRad › powyżej 2 obr/s', () => {
  const angle = 1.234;
  const next = advanceSpinAngleRad(angle, 0, 0.1, JUPITER_HOURS, 1);
  expect(Math.abs(next - angle)).toBeLessThanOrEqual(1e-12);
});

test('advanceSpinAngleRad › RangeError', () => {
  const valid = [0.2, 1, 1.1, 24, 1] as const;
  const cases: {
    index: number;
    value: number;
    parameter: string;
    text: string;
  }[] = [
    { index: 0, value: Number.NaN, parameter: 'angleRad', text: 'NaN' },
    {
      index: 0,
      value: Number.POSITIVE_INFINITY,
      parameter: 'angleRad',
      text: 'Infinity',
    },
    { index: 1, value: Number.NaN, parameter: 'prevDays', text: 'NaN' },
    {
      index: 1,
      value: Number.NEGATIVE_INFINITY,
      parameter: 'prevDays',
      text: '-Infinity',
    },
    { index: 2, value: Number.NaN, parameter: 'days', text: 'NaN' },
    {
      index: 2,
      value: Number.POSITIVE_INFINITY,
      parameter: 'days',
      text: 'Infinity',
    },
    { index: 3, value: 0, parameter: 'periodHours', text: '0' },
    { index: 3, value: -1, parameter: 'periodHours', text: '-1' },
    { index: 3, value: Number.NaN, parameter: 'periodHours', text: 'NaN' },
    {
      index: 3,
      value: Number.POSITIVE_INFINITY,
      parameter: 'periodHours',
      text: 'Infinity',
    },
    { index: 4, value: Number.NaN, parameter: 'daysPerSecond', text: 'NaN' },
    {
      index: 4,
      value: Number.POSITIVE_INFINITY,
      parameter: 'daysPerSecond',
      text: 'Infinity',
    },
  ];

  for (const item of cases) {
    const args = [...valid] as [number, number, number, number, number];
    args[item.index] = item.value;
    expectRangeError(
      () => advanceSpinAngleRad(...args),
      item.parameter,
      item.text,
    );
  }
});
