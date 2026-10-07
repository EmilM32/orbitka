import { expect, test } from 'vitest';

import {
  getSelectableBodies,
  type SelectableBodySource,
} from '@core/selectableBodies.ts';
import { bodies } from '@data/bodies.ts';

const ORDER = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
] as const;

function row(
  id: string,
  type: string,
  axisAu: number | undefined,
  radiusKm = 1,
): SelectableBodySource {
  return {
    id,
    type,
    radiusKm,
    orbit: axisAu === undefined ? undefined : { semiMajorAxisAu: axisAu },
  };
}

test('sun and planets in distance order', () => {
  const selected = getSelectableBodies(bodies);
  const sun = bodies.find((body) => body.id === 'sun');
  const inputIds = bodies.map((body) => body.id);

  expect(selected.map((body) => body.id)).toEqual([...ORDER]);
  expect(selected.map((body) => body.id)).not.toContain('moon');
  expect(selected.map((body) => body.id)).not.toContain('io');
  expect(selected.map((body) => body.id)).not.toContain('pluto');
  expect(selected[0]).toEqual({
    id: 'sun',
    type: 'star',
    radiusKm: sun?.radiusKm,
  });
  expect(bodies.map((body) => body.id)).toEqual(inputIds);

  const shuffled: SelectableBodySource[] = [
    row('neptune', 'planet', 30),
    row('io', 'moon', undefined),
    row('sun', 'star', 99, 10),
    row('mars', 'planet', 1.5),
    row('pluto', 'dwarf', 40),
    row('belt', 'belt', 2.5),
    row('mercury', 'planet', 0.4),
    row('moon', 'moon', undefined),
    row('venus', 'planet', 0.7),
    row('jupiter', 'planet', 5),
    row('saturn', 'planet', 9),
    row('uranus', 'planet', 19),
    row('earth', 'planet', 1),
    row('europa', 'moon', undefined),
  ];
  expect(getSelectableBodies(shuffled).map((body) => body.id)).toEqual([
    ...ORDER,
  ]);

  const starWithAxis = getSelectableBodies([
    row('neptune', 'planet', 30),
    { id: 'sun', type: 'star', radiusKm: 4, orbit: { semiMajorAxisAu: 100 } },
    row('mercury', 'planet', 0.4),
  ]);
  expect(starWithAxis.map((body) => body.id)).toEqual([
    'sun',
    'mercury',
    'neptune',
  ]);
  expect(starWithAxis[0]?.radiusKm).toBe(4);

  const missingAxis = getSelectableBodies([
    row('mars', 'planet', 1.5),
    row('orphan', 'planet', undefined),
    row('sun', 'star', undefined),
    {
      id: 'nan',
      type: 'planet',
      radiusKm: 1,
      orbit: { semiMajorAxisAu: Number.NaN },
    },
  ]);
  expect(missingAxis.map((body) => body.id)).toEqual([
    'sun',
    'mars',
    'orphan',
    'nan',
  ]);

  const forward = getSelectableBodies([
    row('sun', 'star', undefined),
    row('a', 'planet', 1),
    row('b', 'planet', 1),
  ]);
  const reverse = getSelectableBodies([
    row('sun', 'star', undefined),
    row('b', 'planet', 1),
    row('a', 'planet', 1),
  ]);
  expect(forward.map((body) => body.id)).toEqual(['sun', 'a', 'b']);
  expect(reverse.map((body) => body.id)).toEqual(['sun', 'b', 'a']);
});
