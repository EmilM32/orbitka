import { ShaderMaterial } from 'three';
import { expect, test } from 'vitest';

import { INTERIOR_TEXTURES } from '@data/interiors.ts';
import {
  MOVING_TEXTURES,
  createCutawayFaceMaterial,
} from '@render/cutawayFaceMaterial.ts';

test('cutawayFaceMaterial › each texture picks its own branch', () => {
  const time = { value: 0 };
  const radius = { value: 2 };
  const patterns = INTERIOR_TEXTURES.map((texture) => {
    const material = createCutawayFaceMaterial(texture, 1.5, time, radius);
    expect(material).toBeInstanceOf(ShaderMaterial);
    expect(material.uniforms.uSeed.value).toBe(1.5);
    expect(material.uniforms.uTime).toBe(time);
    expect(material.uniforms.uRadius).toBe(radius);
    const pattern = material.uniforms.uPattern.value;
    material.dispose();
    return pattern;
  });
  // The shader's branches are numbered in this order.
  expect(patterns).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(INTERIOR_TEXTURES).toEqual([
    'rock',
    'metal',
    'liquid-metal',
    'gas',
    'ice',
    'plasma',
    'convection',
  ]);
});

test('cutawayFaceMaterial › only fluids drift', () => {
  expect(MOVING_TEXTURES.has('rock')).toBe(false);
  expect(MOVING_TEXTURES.has('metal')).toBe(false);
  expect(MOVING_TEXTURES.has('ice')).toBe(false);
  expect(MOVING_TEXTURES.has('liquid-metal')).toBe(true);
  expect(MOVING_TEXTURES.has('convection')).toBe(true);
});
