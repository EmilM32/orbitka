import { expect, test } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import { SPEED_PRESETS } from '@core/clock.ts';
import { createI18n, type MessageKey } from '@ui/i18n.ts';

const dictionary = {
  'test.plain': 'Hello',
  'test.greeting': 'Hello, {name}',
  'test.days': {
    one: '{count} dzień',
    few: '{count} dni',
    many: '{count} dni',
    other: '{count} dnia',
  },
  'test.years': {
    one: '{count} rok',
    few: '{count} lata',
    many: '{count} lat',
    other: '{count} roku',
  },
};

const i18n = createI18n(dictionary, 'pl-PL');

const PRESET_LABELS: Record<string, string> = {
  pause: 'Pauza',
  day: '1 dzień/s',
  'ten-days': '10 dni/s',
  month: '1 miesiąc/s',
  year: '1 rok/s',
};

const messages: Record<string, unknown> = pl;

function keyTypes(): void {
  const sample = createI18n(dictionary, 'pl-PL');
  // @ts-expect-error unknown key
  sample.t('test.missing');
  // @ts-expect-error plural key is not a message
  sample.t('test.days');
  // @ts-expect-error string key is not a plural message
  sample.plural('test.plain', 1);

  const app = createI18n(pl, 'pl-PL');
  // @ts-expect-error typo is not a message key
  app.t('time.presets.paus');

  const earth: MessageKey = 'bodies.earth.name';
  void earth;
}

void keyTypes;

test('locales › speed presets', () => {
  expect(SPEED_PRESETS.map((preset) => preset.id)).toEqual(
    Object.keys(PRESET_LABELS),
  );

  for (const preset of SPEED_PRESETS) {
    expect(messages[`time.presets.${preset.id}`]).toBe(
      PRESET_LABELS[preset.id],
    );
  }
});

test('i18n › t', () => {
  expect(i18n.t('test.plain')).toBe('Hello');
  expect(i18n.t('test.greeting', { name: 'Ada' })).toBe('Hello, Ada');
  expect(i18n.t('test.greeting', { name: 'Ada', extra: 'ignored' })).toBe(
    'Hello, Ada',
  );
});

test.each([
  [0, '0 dni'],
  [0.1, '0,1 dnia'],
  [1, '1 dzień'],
  [1.5, '1,5 dnia'],
  [2, '2 dni'],
  [5, '5 dni'],
  [22, '22 dni'],
  [364.96, '365 dni'],
  [1000, '1000 dni'],
] as const)('i18n › plural days › %s', (count, expected) => {
  expect(i18n.plural('test.days', count)).toBe(expected);
});

test.each([
  [1, '1 rok'],
  [1.5, '1,5 roku'],
  [2, '2 lata'],
  [4, '4 lata'],
  [5, '5 lat'],
  [12, '12 lat'],
  [14, '14 lat'],
  [22, '22 lata'],
  [25, '25 lat'],
  [10, '10 lat'],
] as const)('i18n › plural years › %s', (count, expected) => {
  expect(i18n.plural('test.years', count)).toBe(expected);
});

test('i18n › plural rounding', () => {
  expect(i18n.plural('test.days', 364.96)).toBe('365 dni');
});

test('i18n › plural negative', () => {
  expect(i18n.plural('test.days', -2)).toBe('-2 dni');
  expect(i18n.plural('test.days', -1)).toBe('-1 dzień');
});

test('i18n › plural count param', () => {
  expect(i18n.plural('test.days', 2, { count: 'nope' })).toBe('2 dni');
});

test('i18n › separate dictionaries', () => {
  const first = createI18n({ 'test.plain': 'One' }, 'pl-PL');
  const second = createI18n({ 'test.plain': 'Two' }, 'pl-PL');
  expect(first.t('test.plain')).toBe('One');
  expect(second.t('test.plain')).toBe('Two');
});

test.each([
  [30.4375, undefined, '30,4'],
  [3652.5, undefined, '3652,5'],
  [9999, undefined, '9999'],
  [12345.6, undefined, '12\u00A0345,6'],
  [-0, undefined, '0'],
  [-0.04, undefined, '0'],
  [2.5, 0, '3'],
] as const)('i18n › formatNumber › %s digits %s', (value, digits, expected) => {
  expect(i18n.formatNumber(value, digits)).toBe(expected);
});

test('i18n › errors', () => {
  const id: string = 'unknown';
  const dynamicKey = `bodies.${id}.name`;
  expect(() => i18n.t(dynamicKey)).toThrow(Error);
  expect(() => i18n.t(dynamicKey)).toThrow(
    'i18n: missing key "bodies.unknown.name"',
  );

  const pluralKey: string = 'test.days';
  expect(() => i18n.t(pluralKey)).toThrow(/test\.days/);
  expect(() => i18n.t(pluralKey)).toThrow(/plural/);

  const textKey: string = 'test.plain';
  expect(() => i18n.plural(textKey, 1)).toThrow(/test\.plain/);
  expect(() => i18n.plural(textKey, 1)).toThrow(/use t\(\)/);

  const incomplete = createI18n(
    {
      'test.days': {
        one: '{count} dzień',
        few: '{count} dni',
        many: '{count} dni',
      },
    },
    'pl-PL',
  );
  expect(() => incomplete.plural('test.days', 1.5)).toThrow(/test\.days/);
  expect(() => incomplete.plural('test.days', 1.5)).toThrow(/other/);

  expect(() => i18n.t('test.greeting')).toThrow(/test\.greeting/);
  expect(() => i18n.t('test.greeting')).toThrow(/\{name\}/);

  expect(() => i18n.plural('test.days', Number.NaN)).toThrow(RangeError);
  expect(() => i18n.plural('test.days', Number.NaN)).toThrow(
    'plural: parameter "count" must be finite, got NaN',
  );
  expect(() => i18n.plural('test.days', Number.POSITIVE_INFINITY)).toThrow(
    'plural: parameter "count" must be finite, got Infinity',
  );
  expect(() => i18n.plural('test.days', Number.NEGATIVE_INFINITY)).toThrow(
    'plural: parameter "count" must be finite, got -Infinity',
  );

  expect(() => i18n.formatNumber(Number.NaN)).toThrow(RangeError);
  expect(() => i18n.formatNumber(Number.NaN)).toThrow(
    'formatNumber: parameter "value" must be finite, got NaN',
  );
  expect(() => i18n.formatNumber(Number.POSITIVE_INFINITY)).toThrow(
    'formatNumber: parameter "value" must be finite, got Infinity',
  );
  expect(() => i18n.formatNumber(Number.NEGATIVE_INFINITY)).toThrow(
    'formatNumber: parameter "value" must be finite, got -Infinity',
  );

  let intlMessage = '';
  try {
    new Intl.PluralRules('!!!');
  } catch (error) {
    intlMessage = error instanceof Error ? error.message : '';
  }
  expect(intlMessage).not.toBe('');
  expect(() => createI18n(dictionary, '!!!')).toThrow(RangeError);
  expect(() => createI18n(dictionary, '!!!')).toThrow(intlMessage);
});
