import {
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
  type Material,
} from 'three';

import type { BodyDef } from '@data/types.ts';
import { circularStartPositionAu } from '@sim/startLayout.ts';
import { compressPositionAu, radiusToScene, type Vec3 } from '@sim/scale.ts';

import { eclipticToScene } from './coords.ts';
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

function placePlanet(def: BodyDef, mesh: Mesh): void {
  const ecliptic: Vec3 = { x: 0, y: 0, z: 0 };
  circularStartPositionAu(def, ecliptic);
  compressPositionAu(ecliptic.x, ecliptic.y, ecliptic.z, ecliptic);
  const scenePosition = new Vector3();
  eclipticToScene(ecliptic, scenePosition);
  mesh.position.copy(scenePosition);
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
      mesh.geometry.dispose();
      disposeMaterial(mesh.material);
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
          `createBodies: ciało „${def.id}” typu planet nie ma orbit`,
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

      if (def.type === 'planet') {
        placePlanet(def, mesh);
      }

      group.add(mesh);
      meshes.set(def.id, mesh);
    }
  } catch (error) {
    dispose();
    throw error;
  }

  return { group, meshes, dispose };
}
