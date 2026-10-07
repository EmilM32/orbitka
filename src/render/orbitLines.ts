import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  type Scene,
  Vector3,
} from 'three';

import type { BodyDef } from '@data/types.ts';
import { bodyPositionAu } from '@sim/kepler.ts';
import { compressPositionAu, type Vec3 } from '@sim/scale.ts';

import { CAMERA_CONFIG } from '@core/cameraConfig.ts';

import { eclipticToScene } from './coords.ts';

export const ORBIT_SEGMENTS = 256;
export const ORBIT_COLOR = 0x5b6b8c;
export const ORBIT_OPACITY = 0.55;

export type OrbitLines = {
  group: Group;
  setOrbitLinesVisible: (visible: boolean) => void;
  setSelectedBody: (id: string | null) => void;
  dispose: () => void;
};

function requireSegments(segments: number): void {
  if (!Number.isInteger(segments) || segments < 3) {
    throw new RangeError(
      `computeOrbitPoints: parameter "segments" must be an integer >= 3, got ${segments}`,
    );
  }
}

// Mean anomaly of sample k is M = 2π·k/segments, so
// t = P·(k/segments − M0/360). The same chain as the planet animator.
export function computeOrbitPoints(
  def: BodyDef,
  segments = ORBIT_SEGMENTS,
): Float32Array {
  requireSegments(segments);

  const orbit = def.orbit;
  if (def.type !== 'planet' || orbit === undefined) {
    throw new Error(
      `computeOrbitPoints: body "${def.id}" has no heliocentric orbit`,
    );
  }

  const points = new Float32Array(segments * 3);
  const bufAu: Vec3 = { x: 0, y: 0, z: 0 };
  const bufScene: Vec3 = { x: 0, y: 0, z: 0 };
  const tmpVector = new Vector3();
  const periodDays = orbit.periodDays;
  const meanAnomalyAtEpochDeg = orbit.meanAnomalyAtEpochDeg;

  for (let k = 0; k < segments; k += 1) {
    const days = periodDays * (k / segments - meanAnomalyAtEpochDeg / 360);
    bodyPositionAu(def, days, bufAu);
    compressPositionAu(bufAu.x, bufAu.y, bufAu.z, bufScene);
    eclipticToScene(bufScene, tmpVector);

    const offset = k * 3;
    points[offset] = tmpVector.x;
    points[offset + 1] = tmpVector.y;
    points[offset + 2] = tmpVector.z;
  }

  return points;
}

function createOrbitMaterial(opacity: number): LineBasicMaterial {
  return new LineBasicMaterial({
    color: ORBIT_COLOR,
    transparent: true,
    opacity,
    depthWrite: false,
  });
}

export function createOrbitLines(defs: readonly BodyDef[]): OrbitLines {
  const group = new Group();
  const normal = createOrbitMaterial(ORBIT_OPACITY);
  const dimmed = createOrbitMaterial(CAMERA_CONFIG.orbitOpacityDimmed);
  const selected = createOrbitMaterial(CAMERA_CONFIG.orbitOpacitySelected);
  const materials = [normal, dimmed, selected];
  const lines: LineLoop[] = [];
  let disposed = false;
  let selectedId: string | null = null;

  const dispose = (): void => {
    if (disposed) {
      return;
    }

    disposed = true;
    for (const line of lines) {
      line.geometry.dispose();
      group.remove(line);
    }
    for (const material of materials) {
      material.dispose();
    }
    lines.length = 0;
    group.removeFromParent();
  };

  const applyMaterials = (): void => {
    const selectedName =
      selectedId === null || selectedId === 'sun' ? '' : `orbit-${selectedId}`;
    let found = false;
    for (const line of lines) {
      if (line.name === selectedName) {
        found = true;
        break;
      }
    }

    for (const line of lines) {
      if (!found) {
        line.material = normal;
      } else if (line.name === selectedName) {
        line.material = selected;
      } else {
        line.material = dimmed;
      }
    }
  };

  try {
    for (const def of defs) {
      if (def.type !== 'planet' || def.orbit === undefined) {
        continue;
      }

      const geometry = new BufferGeometry();
      geometry.setAttribute(
        'position',
        new Float32BufferAttribute(computeOrbitPoints(def), 3),
      );
      const line = new LineLoop(geometry, normal);
      line.name = `orbit-${def.id}`;
      line.frustumCulled = false;
      line.renderOrder = -1;
      group.add(line);
      lines.push(line);
    }
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    group,
    setOrbitLinesVisible(visible: boolean): void {
      if (disposed) {
        return;
      }
      group.visible = visible;
    },
    setSelectedBody(id: string | null): void {
      if (disposed) {
        return;
      }
      selectedId = id;
      applyMaterials();
    },
    dispose,
  };
}

export function addOrbitLines(
  scene: Scene,
  defs: readonly BodyDef[],
): OrbitLines {
  const lines = createOrbitLines(defs);
  scene.add(lines.group);
  return lines;
}
