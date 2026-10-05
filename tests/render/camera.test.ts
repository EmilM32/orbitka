import { Vector3 } from 'three';
import { expect, test } from 'vitest';

import { getBody } from '@data/bodies.ts';
import { createBodies } from '@render/bodies.ts';
import { createCamera, cameraDistanceMultiplier } from '@render/camera.ts';
import { bodies } from '@data/bodies.ts';
import { distanceToScene } from '@sim/scale.ts';

function expectInsideView(
  camera: ReturnType<typeof createCamera>,
  point: Vector3,
): void {
  const projected = point.clone().project(camera);
  expect(Math.abs(projected.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(projected.y)).toBeLessThanOrEqual(1);
}

test('camera › parameters', () => {
  const camera = createCamera(16 / 9);
  const direction = new Vector3();
  camera.getWorldDirection(direction);
  const towardOrigin = new Vector3(0, 0, 0).sub(camera.position).normalize();

  expect(camera.fov).toBe(45);
  expect(camera.near).toBe(0.1);
  expect(camera.far).toBe(2000);
  expect(camera.position.x).toBeCloseTo(0, 8);
  expect(camera.position.y).toBeCloseTo(75, 8);
  expect(camera.position.z).toBeCloseTo(95, 8);
  expect(direction.distanceTo(towardOrigin)).toBeLessThanOrEqual(1e-8);
});

test('camera › multiplier', () => {
  expect(cameraDistanceMultiplier(16 / 9)).toBe(1);
  expect(cameraDistanceMultiplier(1)).toBe(1.2);
  expect(
    Math.abs(cameraDistanceMultiplier(9 / 16) - 2.1333),
  ).toBeLessThanOrEqual(1e-3);

  for (const aspect of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(cameraDistanceMultiplier(aspect)).toBe(1);
  }
});

test('camera › Neptune visibility', () => {
  const neptune = getBody('neptune');
  if (neptune.type === 'moon' || neptune.orbit === undefined) {
    throw new Error('Neptune has no orbit');
  }
  const orbit = neptune.orbit;

  const orbitRadius = distanceToScene(orbit.semiMajorAxisAu);
  const wide = createCamera(16 / 9);
  const portrait = createCamera(9 / 16);
  const placed = createBodies(bodies);

  for (let index = 0; index < 64; index += 1) {
    const angle = (index / 64) * Math.PI * 2;
    const point = new Vector3(
      Math.cos(angle) * orbitRadius,
      0,
      Math.sin(angle) * orbitRadius,
    );
    expectInsideView(wide, point);
    expectInsideView(portrait, point);
  }

  for (const mesh of placed.meshes.values()) {
    if (mesh.name === 'sun') {
      continue;
    }
    expectInsideView(wide, mesh.position);
  }

  placed.dispose();
});
