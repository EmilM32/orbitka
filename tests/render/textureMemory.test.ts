import { DataTexture, LinearFilter, Texture } from 'three';
import { expect, test } from 'vitest';

import {
  MIPMAP_FACTOR,
  createTextureMemory,
  estimateTextureBytes,
} from '@render/textureMemory.ts';

const MIB = 1024 * 1024;

function sized(width: number, height: number, mipmaps = true): Texture {
  const texture = new DataTexture(null, width, height);
  if (!mipmaps) {
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
  } else {
    texture.generateMipmaps = true;
    texture.minFilter = new Texture().minFilter;
  }
  return texture;
}

test('textureMemory › estimates RGBA8 with mipmaps', () => {
  expect(MIPMAP_FACTOR).toBe(4 / 3);
  expect(estimateTextureBytes(1024, 512, true)).toBe(2_796_203);
  expect(estimateTextureBytes(1024, 512, true) / MIB).toBeCloseTo(2.67, 2);
  expect(estimateTextureBytes(2048, 1024, true)).toBe(11_184_811);
  expect(estimateTextureBytes(1024, 512, false)).toBe(2_097_152);
});

test('textureMemory › rejects invalid size', () => {
  for (const width of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    const call = () => estimateTextureBytes(width, 4, false);
    expect(call).toThrow(RangeError);
    expect(call).toThrow(
      `estimateTextureBytes: parameter "width" must be a positive integer, got ${width}`,
    );
  }
  expect(() => estimateTextureBytes(4, 0, true)).toThrow(
    'estimateTextureBytes: parameter "height" must be a positive integer, got 0',
  );
});

test('textureMemory › track/untrack', () => {
  const memory = createTextureMemory();
  const big = sized(1024, 512);
  const small = sized(1024, 512, false);

  expect(memory.getMiB()).toBe(0);
  memory.track(big);
  expect(memory.getMiB()).toBeCloseTo(2_796_203 / MIB, 9);
  memory.track(small);
  expect(memory.getMiB()).toBeCloseTo((2_796_203 + 2_097_152) / MIB, 9);

  memory.untrack(big);
  expect(memory.getMiB()).toBe(2);

  // Unknown texture: no error, no change.
  expect(() => memory.untrack(sized(8, 8))).not.toThrow();
  expect(memory.getMiB()).toBe(2);

  // A texture leaves the register on its own dispose.
  small.dispose();
  expect(memory.getMiB()).toBe(0);
  memory.dispose();
});

test('textureMemory › double track counts once', () => {
  const memory = createTextureMemory();
  const texture = sized(1024, 512, false);

  memory.track(texture);
  memory.track(texture);
  expect(memory.getMiB()).toBe(2);

  memory.untrack(texture);
  expect(memory.getMiB()).toBe(0);
  memory.dispose();
});

test('textureMemory › texture without an image counts as 0 until loaded', () => {
  const memory = createTextureMemory();
  const texture = new Texture();
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;

  memory.track(texture);
  expect(memory.getMiB()).toBe(0);

  texture.image = { width: 1024, height: 512 };
  texture.needsUpdate = true;
  expect(memory.getMiB()).toBe(2);
  memory.dispose();
});

test('textureMemory › dispose clears the register and its listeners', () => {
  const memory = createTextureMemory();
  const texture = sized(1024, 512, false);

  memory.track(texture);
  memory.dispose();
  expect(memory.getMiB()).toBe(0);
  expect(texture.hasEventListener('dispose', () => {})).toBe(false);
  expect(() => texture.dispose()).not.toThrow();
  expect(memory.getMiB()).toBe(0);
});
