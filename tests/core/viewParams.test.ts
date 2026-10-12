import { expect, test } from 'vitest';

import { DAYS_LIMIT, daysFromDate } from '@core/clock.ts';
import { buildViewQuery, parseViewParams } from '@core/viewParams.ts';

const IDS = ['sun', 'mercury', 'earth', 'jupiter', 'saturn', 'neptune'];

function noon(year: number, month: number, day: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(12, 0, 0, 0);
  return daysFromDate(date);
}

test('viewParams › nothing in the address', () => {
  expect(parseViewParams('', IDS)).toEqual({
    bodyId: null,
    days: null,
    presetId: null,
    paused: false,
    cutaway: false,
    ignored: [],
  });
  expect(parseViewParams('?', IDS).ignored).toEqual([]);
});

test('viewParams › a full view', () => {
  expect(
    parseViewParams('?body=saturn&date=2030-01-01&speed=month', IDS),
  ).toEqual({
    bodyId: 'saturn',
    days: noon(2030, 1, 1),
    presetId: 'month',
    paused: false,
    cutaway: false,
    ignored: [],
  });
  const paused = parseViewParams('body=saturn&date=2030-01-01&paused=1', IDS);
  expect(paused.paused).toBe(true);
  expect(paused.bodyId).toBe('saturn');
});

test.each([
  ['unknown body', '?body=pluto', 'body'],
  ['a moon is not selectable', '?body=moon', 'body'],
  ['empty body', '?body=', 'body'],
  ['upper case id', '?body=Saturn', 'body'],
  ['not a date', '?date=tomorrow', 'date'],
  ['wrong separators', '?date=2030/01/01', 'date'],
  ['short year', '?date=30-01-01', 'date'],
  ['month 13', '?date=2030-13-01', 'date'],
  ['day 32', '?date=2030-01-32', 'date'],
  ['rolls over', '?date=2030-02-31', 'date'],
  ['not a leap year', '?date=2029-02-29', 'date'],
  ['year 0', '?date=0000-06-15', 'date'],
  ['unknown preset', '?speed=fast', 'speed'],
  ['pause is not a speed', '?speed=pause', 'speed'],
  ['number as speed', '?speed=100', 'speed'],
  ['paused with another value', '?paused=true', 'paused'],
])('viewParams › %s is ignored', (_name, search, name) => {
  const result = parseViewParams(search, IDS);
  expect(result.ignored).toEqual([name]);
  expect(result.bodyId).toBeNull();
  expect(result.days).toBeNull();
  expect(result.presetId).toBeNull();
  expect(result.paused).toBe(false);
  expect(result.cutaway).toBe(false);
});

test('viewParams › the leap day and the ends of the range', () => {
  expect(parseViewParams('?date=2028-02-29', IDS).days).toBe(noon(2028, 2, 29));
  expect(parseViewParams('?date=0001-01-01', IDS).days).toBe(noon(1, 1, 1));
  expect(parseViewParams('?date=9999-12-31', IDS).days).toBe(
    noon(9999, 12, 31),
  );
  // The clock range is about ±10 000 years, so every 4-digit year fits.
  expect(Math.abs(noon(9999, 12, 31))).toBeLessThanOrEqual(DAYS_LIMIT);
});

test('viewParams › a bad parameter does not spoil the good ones', () => {
  const result = parseViewParams('?body=mars&date=2031-06-15&speed=year', IDS);
  expect(result.bodyId).toBeNull();
  expect(result.days).toBe(noon(2031, 6, 15));
  expect(result.presetId).toBe('year');
  expect(result.ignored).toEqual(['body']);
});

test('viewParams › unrelated and debug parameters are left alone', () => {
  expect(parseViewParams('?debug=1&days=5&quality=low', IDS)).toEqual({
    bodyId: null,
    days: null,
    presetId: null,
    paused: false,
    cutaway: false,
    ignored: [],
  });
});

test('buildViewQuery › a link restores the same view', () => {
  const query = buildViewQuery({
    bodyId: 'saturn',
    days: noon(2030, 1, 1),
    paused: false,
    presetId: 'year',
    cutaway: false,
  });
  expect(query).toBe('body=saturn&date=2030-01-01&speed=year');
  const parsed = parseViewParams(query, IDS);
  expect(parsed.bodyId).toBe('saturn');
  expect(parsed.days).toBe(noon(2030, 1, 1));
  expect(parsed.presetId).toBe('year');
  expect(parsed.ignored).toEqual([]);
});

test('buildViewQuery › paused wins over a speed; no body, no custom speed', () => {
  expect(
    buildViewQuery({
      bodyId: null,
      days: noon(2026, 10, 14),
      paused: true,
      presetId: 'day',
      cutaway: false,
    }),
  ).toBe('date=2026-10-14&paused=1');
  expect(
    buildViewQuery({
      bodyId: null,
      days: noon(2026, 10, 14),
      paused: false,
      presetId: null,
      cutaway: false,
    }),
  ).toBe('date=2026-10-14');
  expect(
    buildViewQuery({
      bodyId: 'sun',
      days: noon(2026, 10, 14),
      paused: false,
      presetId: 'pause',
      cutaway: false,
    }),
  ).toBe('body=sun&date=2026-10-14');
});

test('buildViewQuery › a date the format cannot carry is left out', () => {
  expect(
    buildViewQuery({
      bodyId: null,
      days: -DAYS_LIMIT,
      paused: true,
      presetId: null,
      cutaway: false,
    }),
  ).toBe('paused=1');
  expect(
    buildViewQuery({
      bodyId: null,
      days: Number.NaN,
      paused: true,
      presetId: null,
      cutaway: true,
    }),
  ).toBe('paused=1');
  // Years before 1 CE cannot be written as YYYY-MM-DD here.
  expect(
    buildViewQuery({
      bodyId: null,
      days: noon(1, 1, 1) - 400,
      paused: false,
      presetId: null,
      cutaway: false,
    }),
  ).toBe('');
});

const WITH_INTERIOR = ['earth', 'jupiter', 'saturn'];

test('viewParams › cutaway opens only for a body that has an interior', () => {
  expect(
    parseViewParams('?body=earth&cutaway=1', IDS, WITH_INTERIOR),
  ).toMatchObject({
    bodyId: 'earth',
    cutaway: true,
    ignored: [],
  });
  const missingCatalog = parseViewParams('?body=earth&cutaway=1', IDS);
  expect(missingCatalog.cutaway).toBe(false);
  expect(missingCatalog.ignored).toEqual(['cutaway']);
  expect(parseViewParams('?cutaway=1', IDS, WITH_INTERIOR).ignored).toEqual([
    'cutaway',
  ]);
  const saturn = parseViewParams('?body=saturn&cutaway=1', IDS, ['earth']);
  expect(saturn.bodyId).toBe('saturn');
  expect(saturn.cutaway).toBe(false);
  expect(saturn.ignored).toEqual(['cutaway']);
  expect(
    parseViewParams('?body=earth&cutaway=yes', IDS, WITH_INTERIOR).ignored,
  ).toEqual(['cutaway']);
  const unknownBody = parseViewParams(
    '?body=pluto&cutaway=1',
    IDS,
    WITH_INTERIOR,
  );
  expect(unknownBody.bodyId).toBeNull();
  expect(unknownBody.cutaway).toBe(false);
  expect(unknownBody.ignored).toEqual(['body', 'cutaway']);
});

test('buildViewQuery › cutaway is last and only with a body', () => {
  const query = buildViewQuery({
    bodyId: 'earth',
    days: noon(2000, 1, 1),
    paused: true,
    presetId: 'day',
    cutaway: true,
  });
  expect(query).toBe('body=earth&date=2000-01-01&paused=1&cutaway=1');
  const parsed = parseViewParams(query, IDS, WITH_INTERIOR);
  expect(parsed.bodyId).toBe('earth');
  expect(parsed.cutaway).toBe(true);
  expect(parsed.ignored).toEqual([]);
  expect(
    buildViewQuery({
      bodyId: null,
      days: noon(2000, 1, 1),
      paused: false,
      presetId: null,
      cutaway: true,
    }),
  ).toBe('date=2000-01-01');
});
