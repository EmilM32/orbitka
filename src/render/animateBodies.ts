import { Vector3, type Mesh } from 'three';

import type { BodyDef } from '@data/types.ts';
import { bodyPositionAu } from '@sim/kepler.ts';
import { compressPositionAu, type Vec3 } from '@sim/scale.ts';

import { eclipticToScene } from './coords.ts';

type PlanetView = {
  def: BodyDef;
  mesh: Mesh;
};

export type BodyAnimator = {
  update(daysSinceJ2000: number): void;
};

export function createBodyAnimator(
  defs: readonly BodyDef[],
  meshes: ReadonlyMap<string, Mesh>,
): BodyAnimator {
  const planets: PlanetView[] = [];

  for (const def of defs) {
    if (def.type !== 'planet' || def.orbit === undefined) {
      continue;
    }

    const mesh = meshes.get(def.id);
    if (mesh === undefined) {
      throw new Error(`createBodyAnimator: missing mesh for body "${def.id}"`);
    }

    planets.push({ def, mesh });
  }

  const bufAu: Vec3 = { x: 0, y: 0, z: 0 };
  const bufScene: Vec3 = { x: 0, y: 0, z: 0 };
  const tmpVector = new Vector3();

  return {
    update(daysSinceJ2000: number) {
      for (let index = 0; index < planets.length; index += 1) {
        const planet = planets[index];
        if (planet === undefined) {
          continue;
        }

        bodyPositionAu(planet.def, daysSinceJ2000, bufAu);
        compressPositionAu(bufAu.x, bufAu.y, bufAu.z, bufScene);
        eclipticToScene(bufScene, tmpVector);
        planet.mesh.position.copy(tmpVector);
      }
    },
  };
}
