import { expect, test } from 'vitest';

import interiorContentRaw from '@content/pl/interiors.json' with { type: 'json' };
import { interiors } from '@data/interiors.ts';
import { interiorCardViews, loadInteriorContent } from '@app/interiorViews.ts';

test('interiorViews › joins true kilometers with the Polish layer names', () => {
  const views = interiorCardViews(loadInteriorContent(interiorContentRaw));
  expect(Object.keys(views).toSorted()).toEqual(
    [...interiors.keys()].toSorted(),
  );
  const earth = views.earth;
  expect(earth?.atmosphere).toBe(false);
  expect(earth?.layers[0]).toMatchObject({
    id: 'crust',
    name: 'Skorupa',
    measure: 'thickness',
    km: 35,
  });
  expect(earth?.layers.at(-1)).toMatchObject({
    id: 'inner-core',
    measure: 'radius',
    km: 1221,
  });
  expect(views.jupiter?.atmosphere).toBe(true);
  expect(views.moon?.layers[0]?.name).toBe('Skorupa');
  expect(views.io).toBeUndefined();
});

test('interiorViews › a broken copy file fails fast', () => {
  expect(() => loadInteriorContent({})).toThrow(RangeError);
});
