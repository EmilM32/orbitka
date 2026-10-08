import { expect, test } from 'vitest';

import { getBody } from '@data/bodies.ts';
import { distanceToScene, radiusToScene } from '@sim/scale.ts';

function semiMajorAxisAu(id: string): number {
  const body = getBody(id);
  const axis = body.type === 'moon' ? undefined : body.orbit?.semiMajorAxisAu;
  expect(axis, `${id} orbit is missing`).toBeDefined();
  if (axis === undefined) {
    throw new Error(`${id} orbit is missing`);
  }

  return axis;
}

// Points 2 and 3 of the "Dlaczego?" dialog quote these on-screen ratios
// ("5,5" and "2,6", checked in tests/content/scaleNotice.test.ts).
test('scaleNotice › on-screen numbers in the text', () => {
  const neptune = semiMajorAxisAu('neptune');
  const earth = semiMajorAxisAu('earth');
  const distance = distanceToScene(neptune) / distanceToScene(earth);
  const size =
    radiusToScene(getBody('jupiter').radiusKm) /
    radiusToScene(getBody('earth').radiusKm);

  expect(distance.toFixed(1)).toBe('5.5');
  expect(size.toFixed(1)).toBe('2.6');
});

test('scaleNotice › numbers match the scale', () => {
  const neptuneAu = semiMajorAxisAu('neptune');
  const earthAu = semiMajorAxisAu('earth');
  const mercuryAu = semiMajorAxisAu('mercury');
  const jupiterKm = getBody('jupiter').radiusKm;
  const earthKm = getBody('earth').radiusKm;

  expect(Math.round(neptuneAu / earthAu)).toBe(30);
  expect((earthAu / mercuryAu).toFixed(1)).toBe('2.6');
  expect(jupiterKm / earthKm).toBeGreaterThan(10);
  expect(
    distanceToScene(neptuneAu) / distanceToScene(earthAu),
  ).toBeGreaterThanOrEqual(5.4);
  expect(
    distanceToScene(neptuneAu) / distanceToScene(earthAu),
  ).toBeLessThanOrEqual(5.6);
  expect(
    distanceToScene(earthAu) / distanceToScene(mercuryAu),
  ).toBeGreaterThanOrEqual(1.55);
  expect(
    distanceToScene(earthAu) / distanceToScene(mercuryAu),
  ).toBeLessThanOrEqual(1.65);
  expect(
    radiusToScene(jupiterKm) / radiusToScene(earthKm),
  ).toBeGreaterThanOrEqual(2.5);
  expect(radiusToScene(jupiterKm) / radiusToScene(earthKm)).toBeLessThanOrEqual(
    2.7,
  );
});
