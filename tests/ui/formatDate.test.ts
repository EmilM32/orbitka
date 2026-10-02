import { expect, test } from 'vitest';

import { DAYS_LIMIT, daysToUtcDate } from '@core/clock.ts';
import { formatDate, formatDateTimeAttr } from '@ui/formatDate.ts';

// Date.UTC maps years 0..99 onto 1900..1999. Build those years from epoch 0.
function dateUtc(year: number, month = 0, day = 1): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

test('formatDate › daty', () => {
  expect(formatDate(new Date(Date.UTC(2000, 0, 1)))).toBe('01.01.2000');
  expect(formatDate(new Date(Date.UTC(2026, 8, 30)))).toBe('30.09.2026');
  expect(formatDate(new Date(Date.UTC(2026, 2, 5)))).toBe('05.03.2026');
  expect(formatDate(dateUtc(999))).toBe('01.01.0999');
});

test('formatDate › lata graniczne', () => {
  expect(formatDate(dateUtc(0))).toBe('01.01.0000');
  expect(formatDate(dateUtc(-1))).toBe('01.01.-0001');
  expect(formatDate(dateUtc(10001))).toBe('01.01.10001');
  expect(formatDate(daysToUtcDate(DAYS_LIMIT))).toMatch(/^\d{2}\.\d{2}\.\d+$/u);
  expect(formatDate(daysToUtcDate(-DAYS_LIMIT))).toMatch(
    /^\d{2}\.\d{2}\.-?\d+$/u,
  );
});

test('formatDate › Invalid Date', () => {
  expect(formatDate(new Date(Number.NaN))).toBe('—');
});

test('formatDateTimeAttr › zakres', () => {
  expect(formatDateTimeAttr(dateUtc(1))).toBe('0001-01-01');
  expect(formatDateTimeAttr(dateUtc(9999, 11, 31))).toBe('9999-12-31');
  expect(formatDateTimeAttr(dateUtc(0))).toBeNull();
  expect(formatDateTimeAttr(dateUtc(-1))).toBeNull();
  expect(formatDateTimeAttr(dateUtc(10001))).toBeNull();
  expect(formatDateTimeAttr(new Date(Number.NaN))).toBeNull();
});
