import { Vector3, type Mesh } from 'three';

import type { BodyDef } from '@data/types.ts';
import { bodyPositionAu } from '@sim/kepler.ts';
import { meshIsVisibleForOrbitStep, orbitStepDegrees } from '@sim/orbitStep.ts';
import { orbitPhase } from '@sim/orbitPhase.ts';
import { compressPositionAu, type Vec3 } from '@sim/scale.ts';

import { eclipticToScene } from './coords.ts';

type PlanetView = {
  def: BodyDef;
  mesh: Mesh;
};

/** Receives where each planet is on its orbit line (the trail behind it). */
export type OrbitTrailSink = {
  setBodyTrail(id: string, phase: number, strength: number): void;
};

export type BodyAnimator = {
  update(daysSinceJ2000: number): void;
};

export function createBodyAnimator(
  defs: readonly BodyDef[],
  meshes: ReadonlyMap<string, Mesh>,
  trails?: OrbitTrailSink,
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
  // One clock for every planet. The first update has no previous step.
  let previousDays = 0;
  let hasPreviousDays = false;

  return {
    update(daysSinceJ2000: number) {
      if (planets.length === 0) {
        return;
      }

      for (let index = 0; index < planets.length; index += 1) {
        const planet = planets[index];
        if (planet === undefined) {
          continue;
        }

        bodyPositionAu(planet.def, daysSinceJ2000, bufAu);
        compressPositionAu(bufAu.x, bufAu.y, bufAu.z, bufScene);
        eclipticToScene(bufScene, tmpVector);
        planet.mesh.position.copy(tmpVector);
        if (hasPreviousDays) {
          const periodDays = planet.def.orbit?.periodDays ?? Number.NaN;
          planet.mesh.visible = meshIsVisibleForOrbitStep(
            orbitStepDegrees(daysSinceJ2000 - previousDays, periodDays),
          );
        }
        // The trail goes out with the mesh when the step is too large to follow.
        if (trails !== undefined) {
          trails.setBodyTrail(
            planet.def.id,
            orbitPhase(planet.def, daysSinceJ2000),
            planet.mesh.visible ? 1 : 0,
          );
        }
      }

      previousDays = daysSinceJ2000;
      hasPreviousDays = true;
    },
  };
}
