import {
  DataTexture,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  RingGeometry,
  SRGBColorSpace,
  SphereGeometry,
  Vector3,
} from 'three';
import { expect, test, vi } from 'vitest';

import { getBody } from '@data/bodies.ts';
import type { RingDef } from '@data/types.ts';
import { createBodies } from '@render/bodies.ts';
import {
  RING_PROFILE_SAMPLES,
  RING_RENDER_ORDER,
  RING_SEGMENTS,
  createRing,
} from '@render/saturnRing.ts';
import { createTextureMemory } from '@render/textureMemory.ts';

const SATURN_RING: RingDef = {
  texture: null,
  innerRadiusKm: 74_500,
  outerRadiusKm: 136_780,
};
const SATURN_RADIUS_KM = 58_232;
const SCENE_RADIUS = 1.5;
const COLOR = '#E3CC8F';

function build(memory = createTextureMemory()) {
  return createRing(SATURN_RING, SATURN_RADIUS_KM, SCENE_RADIUS, COLOR, memory);
}

function parts(mesh: Mesh): {
  geometry: RingGeometry;
  material: MeshStandardMaterial;
  texture: DataTexture;
} {
  const { geometry, material } = mesh;
  if (
    !(geometry instanceof RingGeometry) ||
    !(material instanceof MeshStandardMaterial) ||
    !(material.map instanceof DataTexture)
  ) {
    throw new Error('unexpected ring parts');
  }
  return { geometry, material, texture: material.map };
}

test('saturnRing › builds ring geometry', () => {
  const ring = build();
  const { geometry } = parts(ring.mesh);

  expect(RING_SEGMENTS).toBe(128);
  expect(geometry.parameters.thetaSegments).toBe(128);
  expect(geometry.parameters.phiSegments).toBe(1);
  const index = geometry.getIndex();
  expect(index).not.toBeNull();
  expect((index?.count ?? 0) / 3).toBe(256);

  const inner = geometry.parameters.innerRadius / SCENE_RADIUS;
  const outer = geometry.parameters.outerRadius / SCENE_RADIUS;
  expect(Math.abs(inner - 1.279)).toBeLessThanOrEqual(0.001);
  expect(Math.abs(outer - 2.349)).toBeLessThanOrEqual(0.001);
  expect(ring.framingRadius).toBeCloseTo(
    (SCENE_RADIUS * 136_780) / SATURN_RADIUS_KM,
    10,
  );

  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const innerRadius = geometry.parameters.innerRadius;
  const outerRadius = geometry.parameters.outerRadius;
  let innerCount = 0;
  let outerCount = 0;
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const radius = Math.hypot(position.getX(vertex), position.getY(vertex));
    const u = uv.getX(vertex);
    const v = uv.getY(vertex);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
    if (Math.abs(radius - innerRadius) < 1e-6) {
      expect(u).toBe(0);
      innerCount += 1;
    } else {
      expect(radius).toBeCloseTo(outerRadius, 6);
      expect(u).toBe(1);
      outerCount += 1;
    }
  }
  expect(innerCount).toBe(RING_SEGMENTS + 1);
  expect(outerCount).toBe(RING_SEGMENTS + 1);
  ring.dispose();
});

test('saturnRing › lies in the equator plane', () => {
  const ring = build();
  ring.mesh.updateMatrixWorld(true);
  const normal = new Vector3(0, 0, 1).transformDirection(ring.mesh.matrixWorld);
  expect(normal.x).toBeCloseTo(0, 10);
  expect(normal.y).toBeCloseTo(1, 10);
  expect(normal.z).toBeCloseTo(0, 10);
  expect(ring.mesh.renderOrder).toBe(RING_RENDER_ORDER);
  expect(ring.mesh.renderOrder).toBeGreaterThan(0);
  expect(ring.mesh.castShadow).toBe(false);
  expect(ring.mesh.receiveShadow).toBe(false);
  ring.dispose();
});

test('saturnRing › material settings', () => {
  const ring = build();
  const { material, texture } = parts(ring.mesh);

  expect(material.transparent).toBe(true);
  expect(material.side).toBe(DoubleSide);
  expect(material.depthWrite).toBe(false);
  expect(material.forceSinglePass).toBe(true);
  expect(material.alphaTest).toBe(0.01);
  expect(material.color.getHexString()).toBe('e3cc8f');

  expect(texture.image.width).toBe(RING_PROFILE_SAMPLES);
  expect(texture.image.height).toBe(1);
  expect(texture.colorSpace).toBe(SRGBColorSpace);
  expect(texture.image.data).toBeInstanceOf(Uint8Array);
  expect(texture.image.data).toHaveLength(RING_PROFILE_SAMPLES * 4);
  ring.dispose();
});

test('saturnRing › ring is not raycastable', () => {
  const ring = build();
  ring.mesh.updateMatrixWorld(true);
  // Straight down through the B ring, which sits in the XZ plane.
  const raycaster = new Raycaster(
    new Vector3(SCENE_RADIUS * 1.8, 10, 0),
    new Vector3(0, -1, 0),
  );
  expect(raycaster.intersectObject(ring.mesh)).toEqual([]);

  // The same ray hits an ordinary mesh with the same geometry.
  const plain = new Mesh(ring.mesh.geometry);
  plain.rotation.x = -Math.PI / 2;
  plain.updateMatrixWorld(true);
  expect(raycaster.intersectObject(plain)).toHaveLength(1);
  ring.dispose();
});

test('saturnRing › dispose frees geometry, material and texture', () => {
  const memory = createTextureMemory();
  const ring = build(memory);
  const { geometry, material, texture } = parts(ring.mesh);
  // 512×1 RGBA8 with mipmaps: about 0.003 MiB.
  expect(memory.getMiB()).toBeGreaterThan(0.002);
  expect(memory.getMiB()).toBeLessThan(0.003);

  const parent = new Mesh(new SphereGeometry(SCENE_RADIUS));
  parent.add(ring.mesh);
  const geometrySpy = vi.spyOn(geometry, 'dispose');
  const materialSpy = vi.spyOn(material, 'dispose');
  const textureSpy = vi.spyOn(texture, 'dispose');

  ring.dispose();
  ring.dispose();
  expect(geometrySpy).toHaveBeenCalledTimes(1);
  expect(materialSpy).toHaveBeenCalledTimes(1);
  expect(textureSpy).toHaveBeenCalledTimes(1);
  expect(memory.getMiB()).toBe(0);
  expect(parent.children).toHaveLength(0);
});

test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
  'saturnRing › rejects bodySceneRadius %s',
  (radius) => {
    const call = () =>
      createRing(
        SATURN_RING,
        SATURN_RADIUS_KM,
        radius,
        COLOR,
        createTextureMemory(),
      );
    expect(call).toThrow(RangeError);
    expect(call).toThrow(
      `createRing: parameter "bodySceneRadius" must be finite and > 0, got ${radius}`,
    );
  },
);

test('saturnRing › rejects bodyRadiusKm 0', () => {
  expect(() =>
    createRing(SATURN_RING, 0, SCENE_RADIUS, COLOR, createTextureMemory()),
  ).toThrow(
    'createRing: parameter "bodyRadiusKm" must be finite and > 0, got 0',
  );
});

test('saturnRing › createBodies adds the ring to Saturn only', () => {
  const memory = createTextureMemory();
  const saturn = getBody('saturn');
  const view = createBodies(
    [getBody('sun'), saturn, getBody('jupiter')],
    memory,
  );
  const mesh = view.meshes.get('saturn');
  const ring = view.rings.get('saturn');
  expect(ring).toBeDefined();
  expect(ring?.mesh.parent).toBe(mesh);
  expect([...view.rings.keys()]).toEqual(['saturn']);
  expect(view.meshes.get('jupiter')?.children).toHaveLength(0);
  const radius = view.radii.get('saturn') ?? 0;
  expect(ring?.framingRadius).toBeCloseTo(
    (radius * 136_780) / saturn.radiusKm,
    10,
  );
  expect(memory.getMiB()).toBeGreaterThan(0);

  view.dispose();
  expect(memory.getMiB()).toBe(0);
  expect(view.rings.size).toBe(0);
});
