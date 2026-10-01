import { expect, test } from 'vitest';

import { DAYS_LIMIT } from '@core/clock.ts';
import { isStartPaused, parseStartDays } from '@core/startParams.ts';

const FALLBACK = 42;

test.each([
  ['', FALLBACK],
  ['?debug=1', FALLBACK],
  ['?debug=1&days=', FALLBACK],
  ['?debug=1&days=abc', FALLBACK],
  ['?debug=1&days=Infinity', FALLBACK],
  ['?debug=1&days=1e999', FALLBACK],
  ['?debug=1&days=1e9', FALLBACK],
  ['?debug=1&days=NaN', FALLBACK],
  ['?debug=1&days=3652501', FALLBACK],
  ['?days=5', FALLBACK],
  ['?debug=1&days=0', 0],
  ['?debug=1&days=-5', -5],
  ['?debug=1&days=0x10', 16],
  ['?debug=1&days=1e3', 1000],
  ['?debug=1&days=3652500', DAYS_LIMIT],
  ['?debug=1&days=-3652500', -DAYS_LIMIT],
] as const)('startParams › days %s', (search, expected) => {
  expect(parseStartDays(search, FALLBACK)).toBe(expected);
});

test.each([
  ['?paused=1', false],
  ['?debug=1&paused=0', false],
  ['?debug=1&paused=true', false],
  ['?debug=1', false],
  ['?debug=1&paused=1', true],
] as const)('startParams › paused %s', (search, expected) => {
  expect(isStartPaused(search)).toBe(expected);
});

test.each([DAYS_LIMIT + 1, Number.NaN, Number.POSITIVE_INFINITY])(
  'startParams › RangeError fallback %s',
  (fallbackDays) => {
    expect(() => parseStartDays('?debug=1&days=0', fallbackDays)).toThrow(
      RangeError,
    );
    expect(() => parseStartDays('?debug=1&days=0', fallbackDays)).toThrow(
      'fallbackDays',
    );
    expect(() => parseStartDays('?debug=1&days=0', fallbackDays)).toThrow(
      String(fallbackDays),
    );
  },
);
