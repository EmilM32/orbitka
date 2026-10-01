import {
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { expect, test, vi } from 'vitest';

import { bodies, getBody } from '@data/bodies.ts';
import type { BodyDef } from '@data/types.ts';
import { eclipticToScene } from '@render/coords.ts';
import { createBodies } from '@render/bodies.ts';
import { compressPositionAu, radiusToScene } from '@sim/scale.ts';
import { circularStartPositionAu } from '@sim/startLayout.ts';

function sphereRadius(geometry: SphereGeometry): number {
  return geometry.parameters.radius;
}

function asSphere(meshName: string): SphereGeometry {
  const view = createBodies(bodies);
  const mesh = view.meshes.get(meshName);
  if (!mesh || !(mesh.geometry instanceof SphereGeometry)) {
    view.dispose();
    throw new Error(`brak sfery: ${meshName}`);
  }
  const geometry = mesh.geometry;
  view.dispose();
  return geometry;
}

test('bodies › zestaw meshy', () => {
  const moon: BodyDef = {
    ...getBody('earth'),
    id: 'ksiezyc-test',
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

test('bodies › materiały', () => {
  const view = createBodies(bodies);

  for (const body of bodies) {
    const mesh = view.meshes.get(body.id);
    if (!mesh || Array.isArray(mesh.material)) {
      view.dispose();
      throw new Error(`brak materiału: ${body.id}`);
    }

    const material = mesh.material;
    const color = body.visual.color.slice(1).toLowerCase();

    if (body.type === 'star') {
      expect(material).toBeInstanceOf(MeshBasicMaterial);
      if (!(material instanceof MeshBasicMaterial)) {
        view.dispose();
        throw new Error(`oczekiwano MeshBasicMaterial: ${body.id}`);
      }
      expect(material.color.getHexString()).toBe(color);
    } else {
      expect(material).toBeInstanceOf(MeshStandardMaterial);
      if (!(material instanceof MeshStandardMaterial)) {
        view.dispose();
        throw new Error(`oczekiwano MeshStandardMaterial: ${body.id}`);
      }
      expect(material.roughness).toBe(1);
      expect(material.metalness).toBe(0);
      expect(material.color.getHexString()).toBe(color);
    }
  }

  view.dispose();
});

test('bodies › promienie', () => {
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

test('bodies › pozycje', () => {
  const view = createBodies(bodies);
  const earth = view.meshes.get('earth');
  const sun = view.meshes.get('sun');
  if (!earth || !sun) {
    view.dispose();
    throw new Error('brak Ziemi albo Słońca');
  }

  const ecliptic = { x: 0, y: 0, z: 0 };
  circularStartPositionAu(getBody('earth'), ecliptic);
  compressPositionAu(ecliptic.x, ecliptic.y, ecliptic.z, ecliptic);
  const expected = eclipticToScene(ecliptic, new Vector3());

  expect(Math.abs(earth.position.length() - 8)).toBeLessThanOrEqual(0.01);
  expect(earth.position.distanceTo(expected)).toBeLessThanOrEqual(1e-9);
  expect(sun.position.toArray()).toEqual([0, 0, 0]);
  view.dispose();
});

test('bodies › widoczność', () => {
  const view = createBodies(bodies);
  const sun = view.meshes.get('sun');
  if (!sun || !(sun.geometry instanceof SphereGeometry)) {
    view.dispose();
    throw new Error('brak Słońca');
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
        throw new Error('oczekiwano sfer');
      }
      expect(a.position.distanceTo(b.position)).toBeGreaterThan(
        sphereRadius(a.geometry) + sphereRadius(b.geometry),
      );
    }
  }

  view.dispose();
});

test('bodies › dispose', () => {
  const view = createBodies(bodies);
  const geometrySpies = [...view.meshes.values()].map((mesh) =>
    vi.spyOn(mesh.geometry, 'dispose'),
  );
  const materialSpies = [...view.meshes.values()].map((mesh) => {
    if (Array.isArray(mesh.material)) {
      throw new Error('nieoczekiwana lista materiałów');
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

test('bodies › budżet', () => {
  const view = createBodies(bodies);
  let triangles = 0;

  expect(view.meshes.size).toBeLessThanOrEqual(12);

  for (const mesh of view.meshes.values()) {
    const index = mesh.geometry.index;
    if (!index) {
      view.dispose();
      throw new Error(`brak indeksu: ${mesh.name}`);
    }
    triangles += index.count / 3;
  }

  expect(triangles).toBe(21_632);
  expect(triangles).toBeLessThanOrEqual(40_000);
  view.dispose();
});

test('bodies › brzegowe', () => {
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
    'createBodies: ciało „venus” typu planet nie ma orbit',
  );

  const sun = getBody('sun');
  expect(() => createBodies([{ ...sun, radiusKm: Number.NaN }])).toThrow(
    RangeError,
  );
  expect(() => createBodies([{ ...sun, radiusKm: Number.NaN }])).toThrow(
    'radiusToScene',
  );

  const orbit = venus.orbit;
  if (orbit === undefined) {
    throw new Error('Wenus nie ma orbity');
  }
  expect(() =>
    createBodies([
      {
        ...venus,
        orbit: { ...orbit, meanAnomalyAtEpochDeg: Number.NaN },
      },
    ]),
  ).toThrow(RangeError);
});
