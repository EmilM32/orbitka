import {
  AxesHelper,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  type BufferGeometry,
  type Camera,
  type Material,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { expect, test, vi } from 'vitest';

import { bodies } from '@data/bodies.ts';
import type { BodyDef } from '@data/types.ts';
import { addDebugAxes } from '@render/debugAxes.ts';
import { trackDebugDrawCalls } from '@render/renderStats.ts';
import { radiusToScene } from '@sim/scale.ts';

function makeMesh(id: string): Mesh {
  const mesh = new Mesh(new SphereGeometry(1, 8, 4), new MeshBasicMaterial());
  mesh.name = id;
  return mesh;
}

function spinningBodies(defs: readonly BodyDef[]): BodyDef[] {
  return defs.filter((body) => body.type === 'star' || body.type === 'planet');
}

function spinningMeshes(defs: readonly BodyDef[]): Map<string, Mesh> {
  const meshes = new Map<string, Mesh>();
  for (const def of spinningBodies(defs)) {
    meshes.set(def.id, makeMesh(def.id));
  }
  return meshes;
}

test('debugAxes › add and dispose', () => {
  const spinning = spinningBodies(bodies);
  expect(spinning).toHaveLength(9);
  const meshes = spinningMeshes(bodies);

  for (const mesh of meshes.values()) {
    expect(mesh.children).toHaveLength(0);
  }

  const axes = addDebugAxes(bodies, meshes);
  const disposeSpies: { mock: { calls: unknown[] } }[] = [];

  for (const def of spinning) {
    const mesh = meshes.get(def.id);
    if (mesh === undefined) {
      throw new Error(`missing mesh ${def.id}`);
    }
    expect(mesh.children).toHaveLength(1);
    const helper = mesh.children[0];
    expect(helper).toBeInstanceOf(AxesHelper);
    expect(helper?.userData.debug).toBe(true);
    const geometry = (helper as AxesHelper).geometry;
    const position = geometry.getAttribute('position');
    expect(position.getX(1)).toBeCloseTo(2 * radiusToScene(def.radiusKm), 5);

    const material = (helper as AxesHelper).material;
    expect(Array.isArray(material)).toBe(false);
    disposeSpies.push(vi.spyOn(geometry, 'dispose'));
    if (!Array.isArray(material)) {
      disposeSpies.push(vi.spyOn(material, 'dispose'));
    }
  }

  axes.dispose();
  for (const mesh of meshes.values()) {
    expect(mesh.children).toHaveLength(0);
  }
  for (const spy of disposeSpies) {
    expect(spy.mock.calls).toHaveLength(1);
  }

  axes.dispose();
  for (const spy of disposeSpies) {
    expect(spy.mock.calls).toHaveLength(1);
  }

  for (const mesh of meshes.values()) {
    mesh.geometry.dispose();
    if (!Array.isArray(mesh.material)) {
      mesh.material.dispose();
    }
  }
});

test('debugAxes › counted apart from the draw-call budget', () => {
  const meshes = spinningMeshes(bodies);
  const scene = new Group();
  scene.add(...meshes.values());
  const axes = addDebugAxes(bodies, meshes);
  const counter = trackDebugDrawCalls(scene);

  scene.traverse((object) => {
    object.onBeforeRender(
      {} as WebGLRenderer,
      {} as Scene,
      {} as Camera,
      {} as BufferGeometry,
      {} as Material,
      new Group(),
    );
  });
  expect(counter.count).toBe(9);

  counter.dispose();
  axes.dispose();
  for (const mesh of meshes.values()) {
    mesh.geometry.dispose();
    if (!Array.isArray(mesh.material)) {
      mesh.material.dispose();
    }
  }
});
