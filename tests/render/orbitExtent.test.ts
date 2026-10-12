import { Group, PerspectiveCamera } from 'three';
import { expect, test } from 'vitest';

import { bodies } from '@data/bodies.ts';
import { createOrbitLines } from '@render/orbitLines.ts';
import { projectedOrbitExtent } from '@render/orbitExtent.ts';

function topDownCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(45, 2, 0.1, 5000);
  camera.position.set(0, 200, 0.001);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

test('orbitExtent › a circle seen from above is centered and as wide as it is tall', () => {
  const lines = createOrbitLines(bodies);
  const extent = projectedOrbitExtent(
    lines.group.getObjectByName('orbit-earth'),
    topDownCamera(),
    1000,
    500,
  );
  if (extent === null) {
    throw new Error('missing extent');
  }
  const width = extent.right - extent.left;
  const height = extent.bottom - extent.top;
  // Near circular and the same on both sides of the center.
  expect(Math.abs(width - height) / height).toBeLessThan(0.05);
  expect((extent.left + extent.right) / 2).toBeCloseTo(500, 0);
  expect((extent.top + extent.bottom) / 2).toBeCloseTo(250, 0);
  lines.dispose();
});

test('orbitExtent › not a line gives null', () => {
  expect(projectedOrbitExtent(undefined, topDownCamera(), 100, 100)).toBeNull();
  expect(
    projectedOrbitExtent(new Group(), topDownCamera(), 100, 100),
  ).toBeNull();
});
