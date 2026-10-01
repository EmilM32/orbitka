import { MeshBasicMaterial, MeshStandardMaterial, SphereGeometry } from 'three';
import { expect, test, vi } from 'vitest';

import { bodies, getBody } from '@data/bodies.ts';
import type { BodyDef } from '@data/types.ts';
import { createBodyAnimator } from '@render/animateBodies.ts';
import { createBodies } from '@render/bodies.ts';
import { radiusToScene } from '@sim/scale.ts';

function sphereRadius(geometry: SphereGeometry): number {
  return geometry.parameters.radius;
}

function asSphere(meshName: string): SphereGeometry {
  const view = createBodies(bodies);
  const mesh = view.meshes.get(meshName);
  if (!mesh || !(mesh.geometry instanceof SphereGeometry)) {
    view.dispose();
    throw new Error(`missing sphere: ${meshName}`);
  }
  const geometry = mesh.geometry;
  view.dispose();
  return geometry;
}

test('bodies › mesh set', () => {
  const moon: BodyDef = {
    ...getBody('earth'),
    id: 'moon-test',
    type: 'moon',
    parentId: 'earth',
  };
  const defs = [...bodies, moon];
  const view = createBodies(defs);
  const expected = defs.filter(
    (body) => body.type === 'star' || body.type === 'planet',
  );

  expect(view.meshes.size).toBe(expected.length);
  expect(view.group.children).toHaveLength(expected.length);
  expect(expected).toHaveLength(9);
  for (const body of expected) {
    expect(view.meshes.get(body.id)?.name).toBe(body.id);
  }
  expect(view.meshes.has(moon.id)).toBe(false);
  view.dispose();
});

test('bodies › materials', () => {
  const view = createBodies(bodies);

  for (const body of bodies) {
    const mesh = view.meshes.get(body.id);
    if (!mesh || Array.isArray(mesh.material)) {
      view.dispose();
      throw new Error(`missing material: ${body.id}`);
    }

    const material = mesh.material;
    const color = body.visual.color.slice(1).toLowerCase();

    if (body.type === 'star') {
      expect(material).toBeInstanceOf(MeshBasicMaterial);
      if (!(material instanceof MeshBasicMaterial)) {
        view.dispose();
        throw new Error(`expected MeshBasicMaterial: ${body.id}`);
      }
      expect(material.color.getHexString()).toBe(color);
    } else {
      expect(material).toBeInstanceOf(MeshStandardMaterial);
      if (!(material instanceof MeshStandardMaterial)) {
        view.dispose();
        throw new Error(`expected MeshStandardMaterial: ${body.id}`);
      }
      expect(material.roughness).toBe(1);
      expect(material.metalness).toBe(0);
      expect(material.color.getHexString()).toBe(color);
    }
  }

  view.dispose();
});

test('bodies › radii', () => {
  const expected = {
    sun: 3.26,
    mercury: 0.34,
    earth: 0.5,
    jupiter: 1.3,
  } as const;

  for (const [id, radius] of Object.entries(expected)) {
    const geometry = asSphere(id);
    expect(Math.abs(sphereRadius(geometry) - radius)).toBeLessThanOrEqual(0.01);
    expect(sphereRadius(geometry)).toBeCloseTo(
      radiusToScene(getBody(id).radiusKm),
      8,
    );
    geometry.dispose();
  }
});

test('bodies › positions', () => {
  const view = createBodies(bodies);
  const earth = view.meshes.get('earth');
  const sun = view.meshes.get('sun');
  if (!earth || !sun) {
    view.dispose();
    throw new Error('missing Earth or Sun');
  }

  expect(sun.position.toArray()).toEqual([0, 0, 0]);
  expect(earth.position.toArray()).toEqual([0, 0, 0]);
  view.dispose();
});

test('bodies › visibility', () => {
  const view = createBodies(bodies);
  createBodyAnimator(bodies, view.meshes).update(0);
  const sun = view.meshes.get('sun');
  if (!sun || !(sun.geometry instanceof SphereGeometry)) {
    view.dispose();
    throw new Error('missing Sun');
  }

  const sunRadius = sphereRadius(sun.geometry);
  const meshes = [...view.meshes.values()];

  for (const mesh of meshes) {
    if (mesh === sun || !(mesh.geometry instanceof SphereGeometry)) {
      continue;
    }
    expect(
      mesh.position.length() - sphereRadius(mesh.geometry),
    ).toBeGreaterThan(sunRadius);
  }

  for (let left = 0; left < meshes.length; left += 1) {
    for (let right = left + 1; right < meshes.length; right += 1) {
      const a = meshes[left];
      const b = meshes[right];
      if (
        !a ||
        !b ||
        !(a.geometry instanceof SphereGeometry) ||
        !(b.geometry instanceof SphereGeometry)
      ) {
        view.dispose();
        throw new Error('expected spheres');
      }
      expect(a.position.distanceTo(b.position)).toBeGreaterThan(
        sphereRadius(a.geometry) + sphereRadius(b.geometry),
      );
    }
  }

  view.dispose();
});

test('bodies › no star field', () => {
  const view = createBodies(bodies);
  const sun = view.meshes.get('sun');

  expect(sun?.children.some((child) => child.name === 'stars')).toBe(false);
  expect(view.group.children).toHaveLength(9);
  view.dispose();
});

test('bodies › dispose', () => {
  const view = createBodies(bodies);
  const geometrySpies = [...view.meshes.values()].map((mesh) =>
    vi.spyOn(mesh.geometry, 'dispose'),
  );
  const materialSpies = [...view.meshes.values()].map((mesh) => {
    if (Array.isArray(mesh.material)) {
      throw new Error('unexpected material list');
    }
    return vi.spyOn(mesh.material, 'dispose');
  });

  view.dispose();

  expect(geometrySpies).toHaveLength(9);
  for (const spy of geometrySpies) {
    expect(spy).toHaveBeenCalledOnce();
  }
  for (const spy of materialSpies) {
    expect(spy).toHaveBeenCalledOnce();
  }
  expect(view.group.children).toHaveLength(0);
  expect(view.meshes.size).toBe(0);

  expect(() => view.dispose()).not.toThrow();
  for (const spy of geometrySpies) {
    expect(spy).toHaveBeenCalledOnce();
  }
});

test('bodies › budget', () => {
  const view = createBodies(bodies);
  let triangles = 0;

  expect(view.meshes.size).toBeLessThanOrEqual(12);

  for (const mesh of view.meshes.values()) {
    const index = mesh.geometry.index;
    if (!index) {
      view.dispose();
      throw new Error(`missing index: ${mesh.name}`);
    }
    triangles += index.count / 3;
  }

  expect(triangles).toBe(21_632);
  expect(triangles).toBeLessThanOrEqual(40_000);
  view.dispose();
});

test('bodies › edge cases', () => {
  const empty = createBodies([]);
  expect(empty.meshes.size).toBe(0);
  expect(empty.group.children).toHaveLength(0);
  expect(() => empty.dispose()).not.toThrow();

  const withoutStar = createBodies(
    bodies.filter((body) => body.type !== 'star'),
  );
  expect(withoutStar.meshes.has('sun')).toBe(false);
  expect(withoutStar.meshes.size).toBe(8);
  withoutStar.dispose();

  const venus = getBody('venus');
  expect(() => createBodies([{ ...venus, orbit: undefined }])).toThrow(Error);
  expect(() => createBodies([{ ...venus, orbit: undefined }])).toThrow(
    'createBodies: body "venus" of type planet has no orbit',
  );

  const sun = getBody('sun');
  expect(() => createBodies([{ ...sun, radiusKm: Number.NaN }])).toThrow(
    RangeError,
  );
  expect(() => createBodies([{ ...sun, radiusKm: Number.NaN }])).toThrow(
    'radiusToScene',
  );
});
