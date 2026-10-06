import { Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three';
import { expect, test } from 'vitest';

import { bodies, getBody } from '@data/bodies.ts';
import type { BodyDef } from '@data/types.ts';
import { createBodyAnimator } from '@render/animateBodies.ts';
import { eclipticToScene } from '@render/coords.ts';
import { bodyPositionAu } from '@sim/kepler.ts';
import { compressPositionAu } from '@sim/scale.ts';

function makeMesh(id: string): Mesh {
  const mesh = new Mesh(new SphereGeometry(1, 8, 4), new MeshBasicMaterial());
  mesh.name = id;
  return mesh;
}

function planetMeshes(defs: readonly BodyDef[]): Map<string, Mesh> {
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

function expectedEarth(days: number): Vector3 {
  const au = bodyPositionAu(getBody('earth'), days, { x: 0, y: 0, z: 0 });
  const scene = compressPositionAu(au.x, au.y, au.z, { x: 0, y: 0, z: 0 });
  return eclipticToScene(scene, new Vector3());
}

test('animateBodies › Earth at t=0', () => {
  const meshes = planetMeshes(bodies);
  const earth = meshes.get('earth');
  if (!earth) {
    throw new Error('missing Earth');
  }

  createBodyAnimator(bodies, meshes).update(0);
  const expected = expectedEarth(0);

  expect(earth.position.distanceTo(expected)).toBeLessThanOrEqual(1e-9);
  disposeMeshes(meshes);
});

test('animateBodies › Earth after half a year', () => {
  const meshes = planetMeshes(bodies);
  const earth = meshes.get('earth');
  if (!earth) {
    throw new Error('missing Earth');
  }

  const animator = createBodyAnimator(bodies, meshes);
  animator.update(0);
  const atEpoch = earth.position.clone();
  animator.update(182.63);

  expect(earth.position.distanceTo(atEpoch)).toBeGreaterThan(1e-3);
  expect(earth.position.length()).toBeGreaterThanOrEqual(7.93);
  expect(earth.position.length()).toBeLessThanOrEqual(8.07);
  disposeMeshes(meshes);
});

test('animateBodies › Earth period', () => {
  const meshes = planetMeshes(bodies);
  const earth = meshes.get('earth');
  const orbit = getBody('earth').orbit;
  if (!earth || orbit === undefined) {
    throw new Error('missing Earth');
  }

  const animator = createBodyAnimator(bodies, meshes);
  animator.update(0);
  const atEpoch = earth.position.clone();
  animator.update(orbit.periodDays);

  expect(earth.position.distanceTo(atEpoch)).toBeLessThanOrEqual(1e-6);
  disposeMeshes(meshes);
});

test('animateBodies › Mercury min and max', () => {
  const meshes = planetMeshes(bodies);
  const mercury = meshes.get('mercury');
  const orbit = getBody('mercury').orbit;
  if (!mercury || orbit === undefined) {
    throw new Error('missing Mercury');
  }

  const animator = createBodyAnimator(bodies, meshes);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let step = 0; step <= 200; step += 1) {
    animator.update((orbit.periodDays * step) / 200);
    const distance = mercury.position.length();
    min = Math.min(min, distance);
    max = Math.max(max, distance);
  }

  expect(Math.abs(min - 4.44)).toBeLessThanOrEqual(0.1);
  expect(Math.abs(max - 5.47)).toBeLessThanOrEqual(0.1);
  disposeMeshes(meshes);
});

test('animateBodies › Sun', () => {
  const meshes = planetMeshes(bodies);
  const sun = meshes.get('sun');
  if (!sun) {
    throw new Error('missing Sun');
  }

  const animator = createBodyAnimator(bodies, meshes);
  animator.update(0);
  animator.update(-30_000);
  animator.update(10_000);

  expect(sun.position.toArray()).toEqual([0, 0, 0]);
  disposeMeshes(meshes);
});

test('animateBodies › negative days', () => {
  const meshes = planetMeshes(bodies);
  createBodyAnimator(bodies, meshes).update(-30_000);

  for (const mesh of meshes.values()) {
    expect(Number.isFinite(mesh.position.x)).toBe(true);
    expect(Number.isFinite(mesh.position.y)).toBe(true);
    expect(Number.isFinite(mesh.position.z)).toBe(true);
  }
  disposeMeshes(meshes);
});

test('animateBodies › mesh count', () => {
  const meshes = planetMeshes(bodies);
  const before = meshes.size;
  createBodyAnimator(bodies, meshes).update(10);

  expect(meshes.size).toBe(before);
  disposeMeshes(meshes);
});

test('animateBodies › missing mesh', () => {
  const earth = getBody('earth');
  expect(() => createBodyAnimator([earth], new Map())).toThrow(
    'createBodyAnimator: missing mesh for body "earth"',
  );
});

test('animateBodies › empty', () => {
  expect(() => createBodyAnimator([], new Map()).update(0)).not.toThrow();
  const sun = getBody('sun');
  const meshes = new Map([[sun.id, makeMesh(sun.id)]]);
  expect(() => createBodyAnimator([sun], meshes).update(0)).not.toThrow();
  disposeMeshes(meshes);
});

test('animateBodies › RangeError', () => {
  const meshes = planetMeshes(bodies);
  const animator = createBodyAnimator(bodies, meshes);
  animator.update(0);
  const before = [...meshes.values()].map((mesh) => mesh.position.clone());

  for (const days of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    expect(() => animator.update(days)).toThrow(RangeError);
  }

  const after = [...meshes.values()];
  for (let index = 0; index < after.length; index += 1) {
    const mesh = after[index];
    const previous = before[index];
    if (!mesh || !previous) {
      throw new Error('missing mesh');
    }
    expect(mesh.position.distanceTo(previous)).toBe(0);
    expect(Number.isFinite(mesh.position.x)).toBe(true);
    expect(Number.isFinite(mesh.position.y)).toBe(true);
    expect(Number.isFinite(mesh.position.z)).toBe(true);
  }
  disposeMeshes(meshes);
});

test('animateBodies › the same time', () => {
  const meshes = planetMeshes(bodies);
  const animator = createBodyAnimator(bodies, meshes);
  animator.update(100);
  const first = [...meshes.values()].map((mesh) => mesh.position.clone());
  animator.update(100);

  const second = [...meshes.values()];
  for (let index = 0; index < second.length; index += 1) {
    const mesh = second[index];
    const previous = first[index];
    if (!mesh || !previous) {
      throw new Error('missing mesh');
    }
    expect(mesh.position.distanceTo(previous)).toBe(0);
  }
  disposeMeshes(meshes);
});

test('animateBodies › orbit step fade', () => {
  const meshes = planetMeshes(bodies);
  const mercury = meshes.get('mercury');
  const sun = meshes.get('sun');
  if (!mercury || !sun) {
    throw new Error('missing body');
  }

  const slow = createBodyAnimator(bodies, meshes);
  slow.update(0);
  expect(mercury.visible).toBe(true);
  expect(sun.visible).toBe(true);
  slow.update(365.25 / 60);
  expect(mercury.visible).toBe(true);
  expect(Number.isFinite(mercury.position.x)).toBe(true);

  const fast = createBodyAnimator(bodies, meshes);
  fast.update(0);
  fast.update(3652.5 / 60);
  expect(mercury.visible).toBe(false);
  expect(sun.visible).toBe(true);
  expect(Number.isFinite(mercury.position.x)).toBe(true);

  fast.update(3652.5 / 60 - 365.25 / 60);
  expect(mercury.visible).toBe(true);
  fast.update(3652.5 / 60 - 365.25 / 60);
  expect(mercury.visible).toBe(true);

  const reverse = createBodyAnimator(bodies, meshes);
  reverse.update(0);
  reverse.update(-3652.5 / 60);
  expect(mercury.visible).toBe(false);
  expect(sun.visible).toBe(true);

  disposeMeshes(meshes);
});
