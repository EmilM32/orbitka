import {
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Material,
  type Object3D,
} from 'three';

import type { BodyDef } from '@data/types.ts';
import { radiusToScene } from '@sim/scale.ts';

import { SPHERE_SEGMENTS, createSphere } from './sphereFactory.ts';

export type BodyMeshes = {
  group: Group;
  meshes: Map<string, Mesh>;
  dispose: () => void;
};

function materialFor(def: BodyDef): Material {
  if (def.type === 'star') {
    return new MeshBasicMaterial({ color: def.visual.color });
  }

  return new MeshStandardMaterial({
    color: def.visual.color,
    roughness: 1,
    metalness: 0,
  });
}

function disposeMaterial(material: Material | Material[]): void {
  if (Array.isArray(material)) {
    for (const item of material) {
      item.dispose();
    }
    return;
  }

  material.dispose();
}

function hasDisposableResources(object: Object3D): object is Object3D & {
  geometry?: { dispose: () => void };
  material?: Material | Material[];
} {
  return 'geometry' in object || 'material' in object;
}

function disposeObject(object: Object3D): void {
  for (const child of object.children) {
    disposeObject(child);
  }

  if (!hasDisposableResources(object)) {
    return;
  }

  object.geometry?.dispose();

  if (object.material) {
    disposeMaterial(object.material);
  }
}

export function createBodies(defs: readonly BodyDef[]): BodyMeshes {
  const group = new Group();
  const meshes = new Map<string, Mesh>();
  let disposed = false;

  const dispose = (): void => {
    if (disposed) {
      return;
    }

    disposed = true;
    for (const mesh of meshes.values()) {
      disposeObject(mesh);
      group.remove(mesh);
    }
    meshes.clear();
  };

  try {
    for (const def of defs) {
      if (def.type !== 'star' && def.type !== 'planet') {
        continue;
      }

      if (def.type === 'planet' && def.orbit === undefined) {
        throw new Error(
          `createBodies: body "${def.id}" of type planet has no orbit`,
        );
      }

      const segments =
        def.type === 'star' ? SPHERE_SEGMENTS.sun : SPHERE_SEGMENTS.planet;
      const mesh = createSphere(
        radiusToScene(def.radiusKm),
        segments,
        materialFor(def),
      );
      mesh.name = def.id;
      group.add(mesh);
      meshes.set(def.id, mesh);
    }
  } catch (error) {
    dispose();
    throw error;
  }

  return { group, meshes, dispose };
}
