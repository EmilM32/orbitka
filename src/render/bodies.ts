import {
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Material,
  type Object3D,
} from 'three';

import type { BodyDef, MoonDef } from '@data/types.ts';
import { moonRadiiToScene, radiusToScene } from '@sim/scale.ts';

import { createRing, type Ring } from './saturnRing.ts';
import {
  SPHERE_SEGMENTS_DETAILED,
  createSphere,
  type SphereKind,
  type SphereTarget,
} from './sphereFactory.ts';
import { createTextureMemory, type TextureMemory } from './textureMemory.ts';

export type BodyMeshes = {
  group: Group;
  meshes: Map<string, Mesh>;
  /** Sphere radius in scene units, moons on their own scale. */
  radii: Map<string, number>;
  /** Ring meshes by body id, children of the body meshes. */
  rings: Map<string, Ring>;
  /** Every sphere with its kind, for the quality levels. */
  spheres: SphereTarget[];
  dispose: () => void;
};

function moonSceneRadii(defs: readonly BodyDef[]): Map<string, number> {
  const byId = new Map(defs.map((def) => [def.id, def]));
  const byParent = new Map<string, MoonDef[]>();

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
      axesKm.push(orbit.semiMajorAxisKm);
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

// SPEC §9.3, medium and light levels: the disc is warmer and a little
// brighter than its catalog color. Applied to the linear color.
export const SUN_DISC_TINT = [1.15, 1.0, 0.8] as const;

function materialFor(def: BodyDef): Material {
  if (def.type === 'star') {
    const [r, g, b] = SUN_DISC_TINT;
    const color = new Color(def.visual.color).multiply(new Color(r, g, b));
    return new MeshBasicMaterial({ color });
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

export function createBodies(
  defs: readonly BodyDef[],
  textures: TextureMemory = createTextureMemory(),
): BodyMeshes {
  const group = new Group();
  const meshes = new Map<string, Mesh>();
  const radii = new Map<string, number>();
  const rings = new Map<string, Ring>();
  const spheres: SphereTarget[] = [];
  let disposed = false;

  const dispose = (): void => {
    if (disposed) {
      return;
    }

    disposed = true;
    // Before the meshes: the ring also frees its texture.
    for (const ring of rings.values()) {
      ring.dispose();
    }
    rings.clear();
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
      let kind: SphereKind = 'planet';
      if (def.type === 'star') {
        kind = 'sun';
      } else if (def.type === 'moon') {
        const moonRadius = moonRadii.get(def.id);
        if (moonRadius === undefined) {
          throw new Error(`createBodies: moon "${def.id}" has no scene radius`);
        }
        radius = moonRadius;
        kind = 'moon';
      }

      const mesh = createSphere(
        radius,
        SPHERE_SEGMENTS_DETAILED[kind],
        materialFor(def),
      );
      mesh.name = def.id;
      group.add(mesh);
      meshes.set(def.id, mesh);
      radii.set(def.id, radius);
      spheres.push({ mesh, radius, kind });

      const ringDef = def.visual.ring;
      if (ringDef !== undefined) {
        const ring = createRing(
          ringDef,
          def.radiusKm,
          radius,
          def.visual.color,
          textures,
        );
        mesh.add(ring.mesh);
        rings.set(def.id, ring);
      }
    }
  } catch (error) {
    dispose();
    throw error;
  }

  return { group, meshes, radii, rings, spheres, dispose };
}
