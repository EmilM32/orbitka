import { expect, test } from 'vitest';

import { dateDistance } from '@core/dateDistance.ts';

function utc(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

const TODAY = utc(2026, 10, 14);

test.each([
  ['same day', utc(2026, 10, 14), 'today', []],
  ['next day', utc(2026, 10, 15), 'future', [['days', 1]]],
  ['previous day', utc(2026, 10, 13), 'past', [['days', 1]]],
  ['30 days', utc(2026, 11, 13), 'future', [['days', 30]]],
  ['31 days is a month', utc(2026, 11, 14), 'future', [['months', 1]]],
  [
    'months and days',
    utc(2027, 2, 20),
    'future',
    [
      ['months', 4],
      ['days', 6],
    ],
  ],
  [
    'years and months, days dropped',
    utc(2029, 12, 20),
    'future',
    [
      ['years', 3],
      ['months', 2],
    ],
  ],
  ['exact years', utc(2031, 10, 14), 'future', [['years', 5]]],
  [
    'past years and months',
    utc(2021, 5, 1),
    'past',
    [
      ['years', 5],
      ['months', 5],
    ],
  ],
  [
    'year boundary',
    utc(2027, 1, 1),
    'future',
    [
      ['months', 2],
      ['days', 18],
    ],
  ],
  [
    'day of month borrowed from a 28-day February',
    utc(2027, 3, 3),
    'future',
    [
      ['months', 4],
      ['days', 17],
    ],
  ],
])('%s', (_name, target, direction, parts) => {
  expect(dateDistance(TODAY, target)).toEqual({
    direction,
    parts: parts.map(([unit, count]) => ({ unit, count })),
  });
});

test('leap day: 29 Feb to 28 Feb of the next year is 11 months and 30 days', () => {
  expect(dateDistance(utc(2024, 2, 29), utc(2025, 2, 28))).toEqual({
    direction: 'future',
    parts: [
      { unit: 'months', count: 11 },
      { unit: 'days', count: 30 },
    ],
  });
});

test('time of day is ignored', () => {
  const evening = new Date(Date.UTC(2026, 9, 14, 23, 59));
  const morning = new Date(Date.UTC(2026, 9, 14, 0, 1));
  expect(dateDistance(morning, evening).direction).toBe('today');
});

test('years before 100 CE and the date limits do not wrap', () => {
  const far = utc(10000, 1, 1);
  const result = dateDistance(TODAY, far);
  expect(result.direction).toBe('future');
  expect(result.parts[0]).toEqual({ unit: 'years', count: 7973 });
  const ancient = utc(50, 1, 1);
  expect(dateDistance(TODAY, ancient).parts[0]).toEqual({
    unit: 'years',
    count: 1976,
  });
});

test('invalid date throws RangeError', () => {
  expect(() => dateDistance(TODAY, new Date(Number.NaN))).toThrow(RangeError);
});
