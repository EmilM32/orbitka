import { expect, test } from 'vitest';

import { createBodyScreenFrame } from '@core/bodyScreenFrame.ts';

test('frame arrays', () => {
  const ids = ['sun', 'earth', 'neptune'];
  const frame = createBodyScreenFrame(ids);

  expect(frame.count).toBe(3);
  expect(frame.ids).toEqual(ids);
  expect(frame.ids).not.toBe(ids);
  expect(frame.x).toBeInstanceOf(Float64Array);
  expect(frame.y).toBeInstanceOf(Float64Array);
  expect(frame.depth).toBeInstanceOf(Float64Array);
  expect(frame.radiusPx).toBeInstanceOf(Float64Array);
  expect(frame.visible).toBeInstanceOf(Uint8Array);
  expect(frame.x.length).toBe(frame.count);
  expect(frame.y.length).toBe(frame.count);
  expect(frame.depth.length).toBe(frame.count);
  expect(frame.radiusPx.length).toBe(frame.count);
  expect(frame.visible.length).toBe(frame.count);
  expect(Array.from(frame.visible)).toEqual([0, 0, 0]);
  expect(Array.from(frame.x)).toEqual([0, 0, 0]);
  expect(Array.from(frame.depth)).toEqual([0, 0, 0]);

  ids[0] = 'pluto';
  expect(frame.ids[0]).toBe('sun');

  const empty = createBodyScreenFrame([]);
  expect(empty.count).toBe(0);
  expect(empty.x.length).toBe(0);
  expect(empty.visible.length).toBe(0);
});
