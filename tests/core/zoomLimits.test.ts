import { expect, test } from 'vitest';

import { ZOOM_LIMIT_EPSILON, zoomLimitState } from '@core/zoomLimits.ts';

test('zoomLimits › thresholds', () => {
  expect(ZOOM_LIMIT_EPSILON).toBe(0.01);
  expect(zoomLimitState(1.005, 1, 10)).toEqual({ atMin: true, atMax: false });
  expect(zoomLimitState(1, 1, 10)).toEqual({ atMin: true, atMax: false });
  expect(zoomLimitState(9.95, 1, 10)).toEqual({ atMin: false, atMax: true });
  expect(zoomLimitState(12, 1, 10)).toEqual({ atMin: false, atMax: true });
  expect(zoomLimitState(5, 1, 10)).toEqual({ atMin: false, atMax: false });
  expect(zoomLimitState(1.02, 1, 10).atMin).toBe(false);
  expect(zoomLimitState(9.8, 1, 10).atMax).toBe(false);
});

test('zoomLimits › reuses out', () => {
  const out = { atMin: true, atMax: true };
  expect(zoomLimitState(5, 1, 10, out)).toBe(out);
  expect(out).toEqual({ atMin: false, atMax: false });
});

test('zoomLimits › rejects bad input', () => {
  const cases: [number, number, number, string][] = [
    [
      5,
      0,
      10,
      'parameter "min" must be a positive finite number not greater than max, got 0',
    ],
    [
      5,
      -1,
      10,
      'parameter "min" must be a positive finite number not greater than max, got -1',
    ],
    [5, Number.POSITIVE_INFINITY, 10, 'got Infinity'],
    [
      5,
      1,
      Number.NaN,
      'parameter "max" must be a positive finite number, got NaN',
    ],
    [
      5,
      11,
      10,
      'parameter "min" must be a positive finite number not greater than max, got 11',
    ],
    [
      Number.NaN,
      1,
      10,
      'parameter "distance" must be a finite number, got NaN',
    ],
  ];
  for (const [distance, min, max, message] of cases) {
    const call = () => zoomLimitState(distance, min, max);
    expect(call).toThrow(RangeError);
    expect(call).toThrow(message);
  }
});
