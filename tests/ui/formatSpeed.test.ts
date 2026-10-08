import { expect, test } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import { createI18n } from '@ui/i18n.ts';
import { formatSpeed, formatSpeedSpoken } from '@ui/formatSpeed.ts';

const i18n = createI18n(pl, 'pl-PL');

const SPEED_TEXT = /^(?:\d+(?:,\d)?) (?:dzień|dni|dnia|rok|roku|lata|lat)\/s$/u;

const EXAMPLES: readonly (readonly [number, string])[] = [
  [0.1, '0,1 dnia/s'],
  [0.5, '0,5 dnia/s'],
  [1, '1 dzień/s'],
  [1.5, '1,5 dnia/s'],
  [2, '2 dni/s'],
  [5, '5 dni/s'],
  [22, '22 dni/s'],
  [123, '123 dni/s'],
  [364.9, '364,9 dnia/s'],
  [364.96, '365 dni/s'],
  [365.25, '1 rok/s'],
  [547.875, '1,5 roku/s'],
  [730.5, '2 lata/s'],
  [1826.25, '5 lat/s'],
  [3652.5, '10 lat/s'],
];

function gridSpeeds(): number[] {
  const speeds: number[] = [];
  for (let value = 0.1; value <= 400; value += 0.1) {
    speeds.push(Number(value.toFixed(1)));
  }
  for (let value = 407; value <= 3652.5; value += 7) {
    speeds.push(value);
  }
  speeds.push(3652.5);
  return speeds;
}

test('formatSpeed › examples', () => {
  for (const [speed, text] of EXAMPLES) {
    expect(formatSpeed(speed, i18n)).toBe(text);
  }
});

test('formatSpeed › interval property', () => {
  for (const speed of gridSpeeds()) {
    expect(formatSpeed(speed, i18n)).toMatch(SPEED_TEXT);
  }

  expect(formatSpeed(364.96, i18n)).toBe('365 dni/s');
  expect(formatSpeed(365.25, i18n)).toBe('1 rok/s');
  expect(formatSpeed(0.05, i18n)).toMatch(SPEED_TEXT);
  expect(formatSpeed(10_000, i18n)).toMatch(SPEED_TEXT);
});

test('formatSpeed › plural forms', () => {
  expect(formatSpeed(1 * 365.25, i18n)).toBe('1 rok/s');
  expect(formatSpeed(2 * 365.25, i18n)).toBe('2 lata/s');
  expect(formatSpeed(3 * 365.25, i18n)).toBe('3 lata/s');
  expect(formatSpeed(4 * 365.25, i18n)).toBe('4 lata/s');

  for (const years of [5, 6, 7, 8, 9, 10]) {
    expect(formatSpeed(years * 365.25, i18n)).toBe(`${years} lat/s`);
  }

  expect(formatSpeed(1.5 * 365.25, i18n)).toBe('1,5 roku/s');
  expect(formatSpeed(0.5, i18n)).toBe('0,5 dnia/s');
  expect(formatSpeed(1.5, i18n)).toBe('1,5 dnia/s');
});

test('formatSpeed › RangeError', () => {
  const values = [Number.NaN, Number.POSITIVE_INFINITY, 0, -1];

  for (const value of values) {
    expect(() => formatSpeed(value, i18n)).toThrow(RangeError);
    expect(() => formatSpeed(value, i18n)).toThrow('speed');
    expect(() => formatSpeed(value, i18n)).toThrow(String(value));
  }
});

test('formatSpeedSpoken › texts', () => {
  expect(formatSpeedSpoken(365.25, false, false, i18n)).toBe(
    '1 rok na sekundę',
  );
  expect(formatSpeedSpoken(1826.25, true, false, i18n)).toBe(
    'Wstecz · 5 lat na sekundę',
  );
  expect(formatSpeedSpoken(1.5, false, false, i18n)).toBe(
    '1,5 dnia na sekundę',
  );
  expect(formatSpeedSpoken(10, true, true, i18n)).toBe('Pauza');
});
