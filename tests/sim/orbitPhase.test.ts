import { expect, test } from 'vitest';

import { bodies, getBody } from '@data/bodies.ts';
import { orbitPhase } from '@sim/orbitPhase.ts';

const planets = bodies.filter((def) => def.type === 'planet');

test('orbitPhase › stays in [0, 1) over a wide range of days', () => {
  for (const def of planets) {
    for (let days = -3_000_000; days <= 3_000_000; days += 123_457.3) {
      const phase = orbitPhase(def, days);
      expect(phase, `${def.id} ${days}`).toBeGreaterThanOrEqual(0);
      expect(phase, `${def.id} ${days}`).toBeLessThan(1);
    }
  }
});

test('orbitPhase › the epoch value is the mean anomaly at J2000', () => {
  for (const def of planets) {
    const m0 = (def.orbit?.meanAnomalyAtEpochDeg ?? 0) / 360;
    const expected = m0 - Math.floor(m0);
    expect(orbitPhase(def, 0)).toBeCloseTo(expected, 12);
  }
});

test('orbitPhase › one period later it is the same phase', () => {
  const earth = getBody('earth');
  const period = earth.orbit?.periodDays ?? 0;
  const a = orbitPhase(earth, 1234.5);
  const b = orbitPhase(earth, 1234.5 + period);
  expect(Math.abs(a - b) < 1e-9 || Math.abs(Math.abs(a - b) - 1) < 1e-9).toBe(
    true,
  );
});

test('orbitPhase › rises with time and wraps from just below 1 to 0', () => {
  const earth = getBody('earth');
  const period = earth.orbit?.periodDays ?? 0;
  const start = orbitPhase(earth, 0);
  // Just before and after the moment the phase reaches a whole turn.
  const wrapDay = (1 - start) * period;
  const before = orbitPhase(earth, wrapDay - 0.5);
  const after = orbitPhase(earth, wrapDay + 0.5);
  expect(before).toBeGreaterThan(0.99);
  expect(after).toBeLessThan(0.01);
  // Forward in time is forward in phase (mod 1).
  const step = orbitPhase(earth, 10) - orbitPhase(earth, 9);
  expect(step).toBeCloseTo(1 / period, 9);
});

test('orbitPhase › the sample k of an orbit line has phase k / n', () => {
  const mars = getBody('mars');
  const orbit = mars.orbit;
  if (orbit === undefined) {
    throw new Error('missing orbit');
  }
  const n = 256;
  for (const k of [0, 1, 100, 255]) {
    const days = orbit.periodDays * (k / n - orbit.meanAnomalyAtEpochDeg / 360);
    const phase = orbitPhase(mars, days);
    const difference = Math.abs(phase - k / n);
    expect(Math.min(difference, 1 - difference)).toBeLessThan(1e-9);
  }
});

test('orbitPhase › bad input throws RangeError', () => {
  const earth = getBody('earth');
  expect(() => orbitPhase(earth, Number.NaN)).toThrow(RangeError);
  expect(() => orbitPhase(earth, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  expect(() => orbitPhase(getBody('sun'), 0)).toThrow(RangeError);
});
