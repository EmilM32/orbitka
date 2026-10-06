import { expect, test } from 'vitest';

import {
  ELEMENT_VALID_FROM_DAYS,
  ELEMENT_VALID_UNTIL_DAYS,
  orbitalElementsAreApproximate,
} from '@data/elementValidity.ts';

// Same subtraction as daysFromDate in src/core/clock.ts.
// tests/data cannot import @core (ADR-002).
const J2000_UTC_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const MS_PER_DAY = 86_400_000;

function daysFromDate(year: number, monthIndex: number, day: number): number {
  return (Date.UTC(year, monthIndex, day) - J2000_UTC_MS) / MS_PER_DAY;
}

test('elementValidity › bounds', () => {
  expect(ELEMENT_VALID_FROM_DAYS).toBe(-73048.5);
  expect(ELEMENT_VALID_UNTIL_DAYS).toBe(18627.5);
  expect(ELEMENT_VALID_FROM_DAYS).toBe(daysFromDate(1800, 0, 1));
  expect(ELEMENT_VALID_UNTIL_DAYS).toBe(daysFromDate(2051, 0, 1));
});

test('elementValidity › window', () => {
  expect(orbitalElementsAreApproximate(-73048.5)).toBe(false);
  expect(orbitalElementsAreApproximate(0)).toBe(false);
  expect(orbitalElementsAreApproximate(18627)).toBe(false);
  expect(orbitalElementsAreApproximate(-73049.5)).toBe(true);
  expect(orbitalElementsAreApproximate(18627.5)).toBe(true);
});

test('elementValidity › RangeError', () => {
  for (const value of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    const call = () => orbitalElementsAreApproximate(value);
    expect(call).toThrow(RangeError);
    expect(call).toThrow('daysSinceJ2000');
    expect(call).toThrow(String(value));
  }
});
