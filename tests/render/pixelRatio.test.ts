import { expect, test } from 'vitest';

import { resolvePixelRatio } from '@render/pixelRatio.ts';

test('keeps a device pixel ratio of 1', () => {
  expect(resolvePixelRatio(1, false)).toBe(1);
});

test('caps the device pixel ratio at 2', () => {
  expect(resolvePixelRatio(3, false)).toBe(2);
});

test('caps a coarse pointer at 1.5', () => {
  expect(resolvePixelRatio(2, true)).toBe(1.5);
});

test('does not raise a coarse pointer above its device pixel ratio', () => {
  expect(resolvePixelRatio(1, true)).toBe(1);
});

test('the light level caps the pixel ratio at 1', () => {
  expect(resolvePixelRatio(2, false, 1)).toBe(1);
  expect(resolvePixelRatio(1.5, true, 1)).toBe(1);
});

test('a cap above the ratio changes nothing', () => {
  expect(resolvePixelRatio(1.5, false, 2)).toBe(1.5);
});
