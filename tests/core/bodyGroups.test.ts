import { expect, test } from 'vitest';

import { BODY_GROUP_ORDER, bodyGroup, formatAu } from '@core/bodyGroups.ts';
import { getSelectableBodies } from '@core/selectableBodies.ts';
import { bodies } from '@data/bodies.ts';

test('every selectable body has a group', () => {
  expect(BODY_GROUP_ORDER).toEqual(['star', 'rocky', 'gas', 'ice']);
  const groups = getSelectableBodies(bodies).map((body) => bodyGroup(body.id));
  expect(groups).toEqual([
    'star',
    'rocky',
    'rocky',
    'rocky',
    'rocky',
    'gas',
    'gas',
    'ice',
    'ice',
  ]);
  // The list order already follows the group order.
  const ranks = groups.map((group) => BODY_GROUP_ORDER.indexOf(group));
  expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
});

test('unknown id throws RangeError', () => {
  expect(() => bodyGroup('pluto')).toThrow(
    new RangeError(
      'bodyGroup: parameter "id" must be a known body id, got pluto',
    ),
  );
  expect(() => bodyGroup('toString')).toThrow(RangeError);
  expect(() => bodyGroup('moon')).toThrow(RangeError);
});

test('formatAu matches mockup values', () => {
  const planets = getSelectableBodies(bodies).filter(
    (body) => body.type === 'planet',
  );
  const values = planets.map((planet) => {
    const def = bodies.find((body) => body.id === planet.id);
    const axis =
      def?.type === 'planet' ? def.orbit?.semiMajorAxisAu : undefined;
    return formatAu(axis ?? Number.NaN, 'pl-PL');
  });
  expect(values).toEqual([
    '0,39',
    '0,72',
    '1,00',
    '1,52',
    '5,20',
    '9,54',
    '19,19',
    '30,07',
  ]);
  expect(formatAu(0.38709927, 'pl-PL')).toBe('0,39');
  expect(formatAu(30.06992276, 'pl-PL')).toBe('30,07');
});

test.each([Number.NaN, 0, -1, Number.POSITIVE_INFINITY])(
  'formatAu(%s) throws RangeError',
  (value) => {
    expect(() => formatAu(value, 'pl-PL')).toThrow(
      new RangeError(
        `formatAu: parameter "au" must be a positive finite number, got ${value}`,
      ),
    );
  },
);
