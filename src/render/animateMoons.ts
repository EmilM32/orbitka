import { Vector3, type Mesh } from 'three';

import type { BodyDef } from '@data/types.ts';
import { bodyPositionAu } from '@sim/kepler.ts';
import {
  advanceSpinAngleRad,
  rotationsPerSecond,
  spinAngleRad,
} from '@sim/rotation.ts';
import { compressMoonOffsetKm, type Vec3 } from '@sim/scale.ts';

import { eclipticToScene } from './coords.ts';

const DEG_TO_RAD = Math.PI / 180;

type MoonSlot = {
  def: BodyDef;
  parent: BodyDef;
  mesh: Mesh;
  parentMesh: Mesh;
};

export type MoonAnimator = {
  update(daysSinceJ2000: number, daysPerSecond: number): void;
};

export function createMoonAnimator(
  defs: readonly BodyDef[],
  meshes: ReadonlyMap<string, Mesh>,
): MoonAnimator {
  const slots: MoonSlot[] = [];

  for (const def of defs) {
    if (def.type !== 'moon') {
      continue;
    }

    const parentId = def.parentId;
    const parent = defs.find((body) => body.id === parentId);
    const parentMesh = parentId === null ? undefined : meshes.get(parentId);
    const mesh = meshes.get(def.id);
    if (parent === undefined || parentMesh === undefined || parentId === null) {
      throw new Error(
        `createMoonAnimator: missing parent mesh "${String(parentId)}" for moon "${def.id}"`,
      );
    }
    if (mesh === undefined) {
      throw new Error(`createMoonAnimator: missing mesh for moon "${def.id}"`);
    }

    // ZYX applies local Y first, then Z. The moon is not a child of the
    // planet mesh, so the planet's spin is not inherited.
    mesh.rotation.order = 'ZYX';
    mesh.rotation.z = def.rotation.axialTiltDeg * DEG_TO_RAD;
    slots.push({ def, parent, mesh, parentMesh });
  }

  const count = slots.length;
  const angles = new Float64Array(count);
  const previousDays = new Float64Array(count);
  const bufKm: Vec3 = { x: 0, y: 0, z: 0 };
  const bufScene: Vec3 = { x: 0, y: 0, z: 0 };
  const tmp = new Vector3();
  let started = false;

  return {
    update(daysSinceJ2000: number, daysPerSecond: number) {
      if (count === 0) {
        return;
      }

      const probe = slots[0]?.def.rotation.periodHours ?? 0;
      spinAngleRad(daysSinceJ2000, probe);
      rotationsPerSecond(daysPerSecond, probe);

      if (!started) {
        for (let index = 0; index < count; index += 1) {
          const slot = slots[index];
          if (slot === undefined) {
            continue;
          }

          placeMoon(slot, daysSinceJ2000, bufKm, bufScene, tmp);
          const angle = spinAngleRad(
            daysSinceJ2000,
            slot.def.rotation.periodHours,
          );
          angles[index] = angle;
          slot.mesh.rotation.y = angle;
          previousDays[index] = daysSinceJ2000;
        }
        started = true;
        return;
      }

      for (let index = 0; index < count; index += 1) {
        const slot = slots[index];
        const angle = angles[index];
        const prev = previousDays[index];
        if (slot === undefined || angle === undefined || prev === undefined) {
          continue;
        }

        placeMoon(slot, daysSinceJ2000, bufKm, bufScene, tmp);
        const next = advanceSpinAngleRad(
          angle,
          prev,
          daysSinceJ2000,
          slot.def.rotation.periodHours,
          daysPerSecond,
        );
        angles[index] = next;
        slot.mesh.rotation.y = next;
        previousDays[index] = daysSinceJ2000;
      }
    },
  };
}

function placeMoon(
  slot: MoonSlot,
  daysSinceJ2000: number,
  bufKm: Vec3,
  bufScene: Vec3,
  tmp: Vector3,
): void {
  bodyPositionAu(slot.def, daysSinceJ2000, bufKm);
  compressMoonOffsetKm(
    bufKm.x,
    bufKm.y,
    bufKm.z,
    slot.parent.radiusKm,
    bufScene,
  );
  eclipticToScene(bufScene, tmp);
  slot.mesh.position.copy(slot.parentMesh.position).add(tmp);
}
