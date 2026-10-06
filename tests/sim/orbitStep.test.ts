import { expect, test } from 'vitest';

import {
  meshIsVisibleForOrbitStep,
  ORBIT_STEP_FADE_DEG,
  orbitStepDegrees,
} from '@sim/orbitStep.ts';

const MERCURY_PERIOD_DAYS = 87.97;
const YEAR_PER_FRAME_DAYS = 365.25 / 60;
const TEN_YEARS_PER_FRAME_DAYS = 3652.5 / 60;

function expectRangeError(
  call: () => void,
  parameter: string,
  value: number,
): void {
  expect(call).toThrow(RangeError);
  expect(call).toThrow(parameter);
  expect(call).toThrow(String(value));
}

test('orbitStep › degrees', () => {
  expect(
    orbitStepDegrees(YEAR_PER_FRAME_DAYS, MERCURY_PERIOD_DAYS),
  ).toBeCloseTo(24.916, 2);
  expect(
    orbitStepDegrees(TEN_YEARS_PER_FRAME_DAYS, MERCURY_PERIOD_DAYS),
  ).toBeCloseTo(249.16, 1);
  expect(orbitStepDegrees(-YEAR_PER_FRAME_DAYS, MERCURY_PERIOD_DAYS)).toBe(
    orbitStepDegrees(YEAR_PER_FRAME_DAYS, MERCURY_PERIOD_DAYS),
  );
  expect(orbitStepDegrees(0, MERCURY_PERIOD_DAYS)).toBe(0);
});

test('orbitStep › visibility', () => {
  expect(meshIsVisibleForOrbitStep(ORBIT_STEP_FADE_DEG)).toBe(true);
  expect(meshIsVisibleForOrbitStep(30)).toBe(true);
  expect(meshIsVisibleForOrbitStep(30.0001)).toBe(false);
  expect(meshIsVisibleForOrbitStep(0)).toBe(true);
});

test('orbitStep › RangeError', () => {
  for (const value of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    expectRangeError(
      () => orbitStepDegrees(value, MERCURY_PERIOD_DAYS),
      'deltaDays',
      value,
    );
    expectRangeError(() => orbitStepDegrees(1, value), 'periodDays', value);
    expectRangeError(
      () => meshIsVisibleForOrbitStep(value),
      'stepDegrees',
      value,
    );
  }

  expectRangeError(() => orbitStepDegrees(1, 0), 'periodDays', 0);
  expectRangeError(() => orbitStepDegrees(1, -1), 'periodDays', -1);
});
