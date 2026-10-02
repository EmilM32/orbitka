import { Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three';
import { expect, test } from 'vitest';

import { bodies, getBody } from '@data/bodies.ts';
import type { BodyDef, BodyType } from '@data/types.ts';
import { createRotationAnimator } from '@render/rotateBodies.ts';
import { spinAngleRad } from '@sim/rotation.ts';

const EARTH_HOURS = 23.9345;
const TWO_PI = Math.PI * 2;

function makeMesh(id: string): Mesh {
  const mesh = new Mesh(new SphereGeometry(1, 8, 4), new MeshBasicMaterial());
  mesh.name = id;
  return mesh;
}

function spinningMeshes(defs: readonly BodyDef[]): Map<string, Mesh> {
  const meshes = new Map<string, Mesh>();
  for (const def of defs) {
    if (def.type === 'star' || def.type === 'planet') {
      meshes.set(def.id, makeMesh(def.id));
    }
  }
  return meshes;
}

function disposeMeshes(meshes: ReadonlyMap<string, Mesh>): void {
  for (const mesh of meshes.values()) {
    mesh.geometry.dispose();
    if (!Array.isArray(mesh.material)) {
      mesh.material.dispose();
    }
  }
}

function axisY(mesh: Mesh): number {
  return new Vector3(0, 1, 0).applyEuler(mesh.rotation).y;
}

function angularDistance(left: number, right: number): number {
  const turns = (left - right) / TWO_PI;
  let fraction = turns - Math.floor(turns);
  if (fraction >= 1) {
    fraction = 0;
  }
  const wrapped = fraction * TWO_PI;
  return wrapped > Math.PI ? TWO_PI - wrapped : wrapped;
}

test('rotateBodies › spin axis', () => {
  const meshes = spinningMeshes(bodies);
  const animator = createRotationAnimator(bodies, meshes);
  animator.update(0, 1);

  const upright = [
    'earth',
    'mars',
    'jupiter',
    'saturn',
    'neptune',
    'mercury',
    'sun',
  ];
  for (const id of upright) {
    const mesh = meshes.get(id);
    if (mesh === undefined) {
      throw new Error(`missing mesh ${id}`);
    }
    expect(axisY(mesh)).toBeGreaterThan(0);
  }

  const venus = meshes.get('venus');
  const uranus = meshes.get('uranus');
  const earth = meshes.get('earth');
  if (venus === undefined || uranus === undefined || earth === undefined) {
    throw new Error('missing mesh');
  }

  expect(axisY(venus)).toBeLessThan(0);
  expect(axisY(venus)).toBeCloseTo(-0.999, 3);
  expect(axisY(uranus)).toBeLessThan(0);
  expect(axisY(uranus)).toBeCloseTo(-0.136, 2);
  expect(axisY(uranus)).toBeCloseTo(Math.cos((97.77 * Math.PI) / 180), 4);
  expect(Math.abs(axisY(earth) - 0.9175)).toBeLessThanOrEqual(1e-4);
  expect(axisY(earth)).toBeCloseTo(Math.cos((23.44 * Math.PI) / 180), 4);

  disposeMeshes(meshes);
});

test('rotateBodies › update', () => {
  const meshes = spinningMeshes(bodies);
  const earth = meshes.get('earth');
  if (earth === undefined) {
    throw new Error('missing Earth');
  }

  const animator = createRotationAnimator(bodies, meshes);
  const tilt = earth.rotation.z;
  const order = earth.rotation.order;
  const childCount = earth.children.length;
  const meshCount = meshes.size;
  const day = 3;

  animator.update(day, 0.1);
  const spun = earth.rotation.y;
  animator.update(day + EARTH_HOURS / 24, 0.1);

  expect(angularDistance(earth.rotation.y, spun)).toBeLessThan(1e-6);
  expect(earth.rotation.z).toBe(tilt);
  expect(earth.rotation.order).toBe(order);

  animator.update(day, 0);
  const paused = earth.rotation.y;
  animator.update(day, 0);
  expect(earth.rotation.y).toBe(paused);
  expect(earth.children).toHaveLength(childCount);
  expect(meshes.size).toBe(meshCount);

  disposeMeshes(meshes);
});

test('rotateBodies › first frame', () => {
  const meshes = spinningMeshes(bodies);
  const earth = meshes.get('earth');
  if (earth === undefined) {
    throw new Error('missing Earth');
  }

  const days = 12.5;
  createRotationAnimator(bodies, meshes).update(days, 1);
  expect(earth.rotation.y).toBe(spinAngleRad(days, EARTH_HOURS));

  disposeMeshes(meshes);
});

test('rotateBodies › RangeError / missing mesh', () => {
  const meshes = spinningMeshes(bodies);
  const earth = meshes.get('earth');
  if (earth === undefined) {
    throw new Error('missing Earth');
  }

  const animator = createRotationAnimator(bodies, meshes);
  earth.rotation.y = 0.4;

  expect(() => animator.update(Number.NaN, 1)).toThrow(RangeError);
  expect(earth.rotation.y).toBe(0.4);
  expect(() => animator.update(1, Number.POSITIVE_INFINITY)).toThrow(
    RangeError,
  );
  expect(Number.isFinite(earth.rotation.y)).toBe(true);
  expect(earth.rotation.y).toBe(0.4);

  expect(() => createRotationAnimator([getBody('earth')], new Map())).toThrow(
    'createRotationAnimator: missing mesh for body "earth"',
  );

  const skippedTypes: BodyType[] = ['moon', 'dwarf', 'belt'];
  for (const type of skippedTypes) {
    const def: BodyDef = { ...getBody('earth'), id: `skipped-${type}`, type };
    const mesh = makeMesh(def.id);
    const skipped = new Map([[def.id, mesh]]);
    createRotationAnimator([def], skipped).update(10, 1);
    expect(mesh.rotation.y).toBe(0);
    expect(mesh.rotation.order).toBe('XYZ');
    disposeMeshes(skipped);
  }

  expect(() =>
    createRotationAnimator([], new Map()).update(Number.NaN, 1),
  ).not.toThrow();

  disposeMeshes(meshes);
});
