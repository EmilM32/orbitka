import { AmbientLight, PointLight } from 'three';
import { expect, test } from 'vitest';

import { createLights } from '@render/lights.ts';

test('lights › wartości', () => {
  const group = createLights();
  const point = group.children.find((child) => child instanceof PointLight);
  const ambient = group.children.find((child) => child instanceof AmbientLight);

  expect(point).toBeInstanceOf(PointLight);
  expect(ambient).toBeInstanceOf(AmbientLight);
  if (!(point instanceof PointLight) || !(ambient instanceof AmbientLight)) {
    throw new Error('brak świateł');
  }

  expect(point.intensity).toBe(3);
  expect(point.distance).toBe(0);
  expect(point.decay).toBe(0);
  expect(point.castShadow).toBe(false);
  expect(point.position.toArray()).toEqual([0, 0, 0]);
  expect(point.color.getHex()).toBe(0xffffff);
  expect(ambient.intensity).toBe(0.15);
  expect(ambient.color.getHex()).toBe(0xffffff);
});
