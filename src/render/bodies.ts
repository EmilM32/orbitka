import {
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Material,
  type Object3D,
} from 'three';

import type { BodyDef } from '@data/types.ts';
import { moonRadiiToScene, radiusToScene } from '@sim/scale.ts';

import { SPHERE_SEGMENTS, createSphere } from './sphereFactory.ts';

export type BodyMeshes = {
  group: Group;
  meshes: Map<string, Mesh>;
  dispose: () => void;
};

function moonSceneRadii(defs: readonly BodyDef[]): Map<string, number> {
  const byId = new Map(defs.map((def) => [def.id, def]));
  const byParent = new Map<string, BodyDef[]>();

  for (const def of defs) {
    if (def.type !== 'moon') {
      continue;
    }

    if (def.orbit === undefined) {
      throw new Error(
        `createBodies: body "${def.id}" of type moon has no orbit`,
      );
    }

    const parentId = def.parentId;
    const parent = parentId === null ? undefined : byId.get(parentId);
    if (parentId === null || parent === undefined) {
      throw new Error(
        `createBodies: moon "${def.id}" has no parent "${String(parentId)}"`,
      );
    }

    const group = byParent.get(parentId);
    if (group === undefined) {
      byParent.set(parentId, [def]);
    } else {
      group.push(def);
    }
  }

  const radii = new Map<string, number>();

  for (const [parentId, moons] of byParent) {
    const parent = byId.get(parentId);
    const first = moons[0];
    if (parent === undefined || first === undefined) {
      throw new Error(
        `createBodies: moon "${first?.id ?? parentId}" has no parent "${parentId}"`,
      );
    }

    const axesKm: number[] = [];
    const eccentricities: number[] = [];
    const radiiKm: number[] = [];
    for (const moon of moons) {
      const orbit = moon.orbit;
      if (orbit === undefined) {
        throw new Error(
          `createBodies: body "${moon.id}" of type moon has no orbit`,
        );
      }
      axesKm.push(orbit.semiMajorAxisAu);
      eccentricities.push(orbit.eccentricity);
      radiiKm.push(moon.radiusKm);
    }

    const sceneRadii = moonRadiiToScene(
      axesKm,
      eccentricities,
      radiiKm,
      parent.radiusKm,
    );
    for (let index = 0; index < moons.length; index += 1) {
      const moon = moons[index];
      const radius = sceneRadii[index];
      if (moon === undefined || radius === undefined) {
        throw new Error(
          `createBodies: moon "${moon?.id ?? parentId}" has no scene radius`,
        );
      }
      radii.set(moon.id, radius);
    }
  }

  return radii;
}

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
    const moonRadii = moonSceneRadii(defs);

    for (const def of defs) {
      if (def.type !== 'star' && def.type !== 'planet' && def.type !== 'moon') {
        continue;
      }

      if (def.type === 'planet' && def.orbit === undefined) {
        throw new Error(
          `createBodies: body "${def.id}" of type planet has no orbit`,
        );
      }

      let radius = radiusToScene(def.radiusKm);
      let segments: number = SPHERE_SEGMENTS.planet;
      if (def.type === 'star') {
        segments = SPHERE_SEGMENTS.sun;
      } else if (def.type === 'moon') {
        const moonRadius = moonRadii.get(def.id);
        if (moonRadius === undefined) {
          throw new Error(`createBodies: moon "${def.id}" has no scene radius`);
        }
        radius = moonRadius;
        segments = SPHERE_SEGMENTS.moon;
      }

      const mesh = createSphere(radius, segments, materialFor(def));
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
