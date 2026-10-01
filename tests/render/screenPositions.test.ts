import { expect, test } from 'vitest';

import { createCamera } from '@render/camera.ts';
import { getBodyScreenPositions } from '@render/screenPositions.ts';

const WIDTH = 1280;
const HEIGHT = 720;

test('screenPositions › rzutowanie', () => {
  const camera = createCamera(16 / 9);
  const [center] = getBodyScreenPositions(
    [{ id: 'sun', type: 'star', position: { x: 0, y: 0, z: 0 } }],
    camera,
    WIDTH,
    HEIGHT,
  );

  if (!center) {
    throw new Error('brak rzutu środka');
  }

  expect(center.visible).toBe(true);
  expect(Math.abs(center.x - WIDTH / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(center.y - HEIGHT / 2)).toBeLessThanOrEqual(1);

  const [behind] = getBodyScreenPositions(
    [{ id: 'za', type: 'planet', position: { x: 0, y: 150, z: 190 } }],
    camera,
    WIDTH,
    HEIGHT,
  );
  expect(behind?.visible).toBe(false);

  const [outside] = getBodyScreenPositions(
    [{ id: 'bok', type: 'planet', position: { x: 10_000, y: 0, z: 0 } }],
    camera,
    WIDTH,
    HEIGHT,
  );
  expect(outside?.visible).toBe(false);

  expect(getBodyScreenPositions([], camera, WIDTH, HEIGHT)).toEqual([]);

  for (const width of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const call = () => getBodyScreenPositions([], camera, width, HEIGHT);
    expect(call).toThrow(RangeError);
    expect(call).toThrow(
      `getBodyScreenPositions: parametr „width” musi być skończony i > 0, otrzymano ${width}`,
    );
  }

  for (const height of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const call = () => getBodyScreenPositions([], camera, WIDTH, height);
    expect(call).toThrow(RangeError);
    expect(call).toThrow(
      `getBodyScreenPositions: parametr „height” musi być skończony i > 0, otrzymano ${height}`,
    );
  }
});
