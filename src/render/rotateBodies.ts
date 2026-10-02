import type { Mesh } from 'three';

import type { BodyDef } from '@data/types.ts';
import {
  advanceSpinAngleRad,
  rotationsPerSecond,
  spinAngleRad,
} from '@sim/rotation.ts';

const DEG_TO_RAD = Math.PI / 180;

export type RotationAnimator = {
  update(daysSinceJ2000: number, daysPerSecond: number): void;
};

export function createRotationAnimator(
  defs: readonly BodyDef[],
  meshes: ReadonlyMap<string, Mesh>,
): RotationAnimator {
  const targets: Mesh[] = [];
  const periods: number[] = [];

  for (const def of defs) {
    if (def.type !== 'star' && def.type !== 'planet') {
      continue;
    }

    const mesh = meshes.get(def.id);
    if (mesh === undefined) {
      throw new Error(
        `createRotationAnimator: missing mesh for body "${def.id}"`,
      );
    }

    // ZYX applies local Y first, then Z, so the spin axis is tilted rather
    // than the whole body spinning in the ecliptic. X stays 0.
    mesh.rotation.order = 'ZYX';
    mesh.rotation.z = def.rotation.axialTiltDeg * DEG_TO_RAD;
    targets.push(mesh);
    periods.push(def.rotation.periodHours);
  }

  const count = targets.length;
  const periodHours = Float64Array.from(periods);
  const angles = new Float64Array(count);
  const previousDays = new Float64Array(count);
  let started = false;

  return {
    update(daysSinceJ2000: number, daysPerSecond: number) {
      if (count === 0) {
        return;
      }

      const probe = periodHours[0] ?? 0;
      spinAngleRad(daysSinceJ2000, probe);
      rotationsPerSecond(daysPerSecond, probe);

      if (!started) {
        for (let index = 0; index < count; index += 1) {
          const mesh = targets[index];
          const period = periodHours[index];
          if (mesh === undefined || period === undefined) {
            continue;
          }

          const angle = spinAngleRad(daysSinceJ2000, period);
          angles[index] = angle;
          mesh.rotation.y = angle;
          previousDays[index] = daysSinceJ2000;
        }
        started = true;
        return;
      }

      for (let index = 0; index < count; index += 1) {
        const mesh = targets[index];
        const period = periodHours[index];
        const angle = angles[index];
        const prev = previousDays[index];
        if (
          mesh === undefined ||
          period === undefined ||
          angle === undefined ||
          prev === undefined
        ) {
          continue;
        }

        const next = advanceSpinAngleRad(
          angle,
          prev,
          daysSinceJ2000,
          period,
          daysPerSecond,
        );
        angles[index] = next;
        mesh.rotation.y = next;
        previousDays[index] = daysSinceJ2000;
      }
    },
  };
}
