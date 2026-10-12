import { expect, test } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import { dateDistance } from '@core/dateDistance.ts';
import { formatDateWords } from '@ui/formatDate.ts';
import { formatDistance } from '@ui/formatDistance.ts';
import { createI18n } from '@ui/i18n.ts';

const i18n = createI18n(pl, 'pl-PL');

function utc(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

const TODAY = utc(2026, 10, 14);

test.each([
  [utc(2026, 10, 14), 'dziś'],
  [utc(2026, 10, 15), 'za 1 dzień'],
  [utc(2026, 10, 13), '1 dzień temu'],
  [utc(2026, 10, 19), 'za 5 dni'],
  [utc(2026, 11, 14), 'za 1 miesiąc'],
  [utc(2027, 1, 14), 'za 3 miesiące'],
  [utc(2027, 3, 14), 'za 5 miesięcy'],
  [utc(2026, 5, 14), '5 miesięcy temu'],
  [utc(2028, 10, 14), 'za 2 lata'],
  [utc(2029, 12, 20), 'za 3 lata i 2 miesiące'],
  [utc(2031, 10, 14), 'za 5 lat'],
  [utc(2001, 1, 1), '25 lat i 9 miesięcy temu'],
  [utc(2027, 11, 14), 'za 1 rok i 1 miesiąc'],
])('distance %#', (target, expected) => {
  expect(formatDistance(dateDistance(TODAY, target), i18n)).toBe(expected);
});

test('date in words', () => {
  expect(formatDateWords(utc(2026, 10, 14), i18n)).toBe('14 października 2026');
  expect(formatDateWords(utc(2000, 1, 1), i18n)).toBe('1 stycznia 2000');
  expect(formatDateWords(utc(2024, 2, 29), i18n)).toBe('29 lutego 2024');
  expect(formatDateWords(utc(1, 1, 1), i18n)).toBe('1 stycznia 1');
  expect(formatDateWords(utc(10000, 1, 1), i18n)).toBe('1 stycznia 10000');
});

test('dates before 1 CE use p.n.e. with the year counted from 1 BCE', () => {
  expect(formatDateWords(utc(0, 12, 31), i18n)).toBe('31 grudnia 1 p.n.e.');
  expect(formatDateWords(utc(-499, 3, 5), i18n)).toBe('5 marca 500 p.n.e.');
});

test('invalid date', () => {
  expect(formatDateWords(new Date(Number.NaN), i18n)).toBe('—');
});
