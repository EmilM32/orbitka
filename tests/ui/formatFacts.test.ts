import { expect, test } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import { computeBodyFacts } from '@core/bodyFacts.ts';
import { getBody } from '@data/bodies.ts';
import { formatDay, formatYear } from '@ui/formatFacts.ts';
import { createI18n } from '@ui/i18n.ts';

const i18n = createI18n(pl, 'pl-PL');
const earth = getBody('earth');

function texts(id: string): { year: string | null; day: string } {
  const body = getBody(id);
  const facts = computeBodyFacts(body, earth);
  return {
    year: formatYear(facts, body.orbit?.periodDays ?? null, i18n),
    day: formatDay(facts.dayHours, i18n),
  };
}

test('formatFacts › planets', () => {
  expect(texts('jupiter')).toEqual({ year: '11,9 roku', day: '9 h 56 min' });
  expect(texts('saturn')).toEqual({ year: '29,4 roku', day: '10 h 39 min' });
  expect(texts('earth')).toEqual({ year: '1 rok', day: '23 h 56 min' });

  const mercury = texts('mercury');
  expect(mercury.year).toBe('88 dni');
  const days = i18n.formatNumber(
    Math.round((getBody('mercury').rotation.periodHours / 24) * 10) / 10,
  );
  expect(mercury.day).toBe(`${days} doby`);
});

test('formatFacts › no year for the Sun and the Moon', () => {
  expect(texts('sun').year).toBeNull();
  expect(texts('moon').year).toBeNull();
  expect(texts('moon').day).toMatch(/^\d+,\d doby$/u);
});

test('formatFacts › plural forms of days', () => {
  expect(formatDay(24, i18n)).toBe('24 h 0 min');
  expect(formatDay(48, i18n)).toBe('2 doby');
  expect(formatDay(5 * 24, i18n)).toBe('5 dób');
  expect(formatDay(1.5 * 24 * 10, i18n)).toBe('15 dób');
});

test('formatFacts › year below one Earth year needs the period', () => {
  const facts = {
    diameterVsEarth: 1,
    isReference: false,
    yearEarthYears: 0.5,
    dayHours: 10,
  };
  expect(formatYear(facts, 182.6, i18n)).toBe('183 dni');
  expect(() => formatYear(facts, null, i18n)).toThrow(
    new RangeError(
      'formatYear: parameter "periodDays" must be a finite number > 0, got null',
    ),
  );
});
