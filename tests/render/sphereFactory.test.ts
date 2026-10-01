import { MeshBasicMaterial, SphereGeometry } from 'three';
import { expect, test } from 'vitest';

import { SPHERE_SEGMENTS, createSphere } from '@render/sphereFactory.ts';

test('sphereFactory › segmenty', () => {
  expect(SPHERE_SEGMENTS.planet).toBe(48);
  expect(SPHERE_SEGMENTS.sun).toBe(64);

  const material = new MeshBasicMaterial();
  const planet = createSphere(1, SPHERE_SEGMENTS.planet, material);
  const sun = createSphere(1, SPHERE_SEGMENTS.sun, new MeshBasicMaterial());

  expect(planet.geometry).toBeInstanceOf(SphereGeometry);
  expect(sun.geometry).toBeInstanceOf(SphereGeometry);
  if (!(planet.geometry instanceof SphereGeometry)) {
    throw new Error('oczekiwano sfery planety');
  }
  if (!(sun.geometry instanceof SphereGeometry)) {
    throw new Error('oczekiwano sfery Słońca');
  }

  expect(planet.geometry.parameters.widthSegments).toBe(48);
  expect(planet.geometry.parameters.heightSegments).toBe(24);
  expect(sun.geometry.parameters.widthSegments).toBe(64);
  expect(sun.geometry.parameters.heightSegments).toBe(32);

  planet.geometry.dispose();
  sun.geometry.dispose();
  material.dispose();
  if (!Array.isArray(sun.material)) {
    sun.material.dispose();
  }
});

test('sphereFactory › RangeError', () => {
  const material = new MeshBasicMaterial();

  for (const segments of [
    2,
    2.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    0,
    -8,
  ]) {
    const call = () => createSphere(1, segments, material);
    expect(call).toThrow(RangeError);
    expect(call).toThrow(
      `createSphere: parametr „segments” musi być całkowity ≥ 3, otrzymano ${segments}`,
    );
  }

  for (const radius of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const call = () => createSphere(radius, 8, material);
    expect(call).toThrow(RangeError);
    expect(call).toThrow(
      `createSphere: parametr „radius” musi być skończony i > 0, otrzymano ${radius}`,
    );
  }

  material.dispose();
});
