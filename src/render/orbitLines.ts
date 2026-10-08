import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  type Camera,
  type Scene,
  type WebGLProgramParametersWithUniforms,
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
// ADR-010 point 10: no orbit line is drawn closer than 1.25 R to the line of
// sight through the selected body's center.
export const ORBIT_GAP_RADIUS_FACTOR = 1.25;

export type OrbitLines = {
  group: Group;
  setOrbitLinesVisible: (visible: boolean) => void;
  setSelectedBody: (id: string | null) => void;
  /**
   * Cuts every orbit line where it passes in front of or behind the disc
   * centered at `center` (world space) with scene radius `radius`. `null`
   * removes the gap. Called every frame; it does not allocate.
   */
  setGap: (center: Vector3 | null, radius: number, camera: Camera) => void;
  dispose: () => void;
};

export type OrbitGapUniforms = {
  uGapC: { value: Vector3 };
  uGapR: { value: number };
};

const GAP_VERTEX_HEAD = 'varying vec3 vGapViewPosition;\nvoid main() {';
const GAP_VERTEX_BODY =
  '#include <project_vertex>\n\tvGapViewPosition = mvPosition.xyz;';
// The camera sits at the view-space origin. A fragment is dropped when the ray
// from the camera through it passes within uGapR of the body center, so the
// line is cut both in front of and behind the disc.
const GAP_FRAGMENT_HEAD = `uniform vec3 uGapC;
uniform float uGapR;
varying vec3 vGapViewPosition;
void main() {
\tif ( uGapR > 0.0 ) {
\t\tvec3 gapRay = normalize( vGapViewPosition );
\t\tfloat gapAlong = dot( uGapC, gapRay );
\t\tif ( gapAlong > 0.0 && length( uGapC - gapRay * gapAlong ) < uGapR ) discard;
\t}`;

function replaceOnce(source: string, anchor: string, next: string): string {
  if (!source.includes(anchor)) {
    throw new Error(`orbit gap patch: shader has no "${anchor}"`);
  }
  return source.replace(anchor, next);
}

export function patchOrbitGap(
  shader: WebGLProgramParametersWithUniforms,
  uniforms: OrbitGapUniforms,
): void {
  shader.uniforms.uGapC = uniforms.uGapC;
  shader.uniforms.uGapR = uniforms.uGapR;
  shader.vertexShader = replaceOnce(
    replaceOnce(shader.vertexShader, 'void main() {', GAP_VERTEX_HEAD),
    '#include <project_vertex>',
    GAP_VERTEX_BODY,
  );
  shader.fragmentShader = replaceOnce(
    shader.fragmentShader,
    'void main() {',
    GAP_FRAGMENT_HEAD,
  );
}

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

function createOrbitMaterial(
  opacity: number,
  uniforms: OrbitGapUniforms,
): LineBasicMaterial {
  const material = new LineBasicMaterial({
    color: ORBIT_COLOR,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  // On each material, not through scene.traverse: dimmed and selected are
  // attached to the lines only after a selection (SPEC §9.2).
  material.onBeforeCompile = (shader) => {
    patchOrbitGap(shader, uniforms);
  };
  return material;
}

export function createOrbitLines(defs: readonly BodyDef[]): OrbitLines {
  const group = new Group();
  // One set of uniforms, shared by the three materials.
  const gap: OrbitGapUniforms = {
    uGapC: { value: new Vector3() },
    uGapR: { value: 0 },
  };
  const normal = createOrbitMaterial(ORBIT_OPACITY, gap);
  const dimmed = createOrbitMaterial(CAMERA_CONFIG.orbitOpacityDimmed, gap);
  const selected = createOrbitMaterial(CAMERA_CONFIG.orbitOpacitySelected, gap);
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
    setGap(center: Vector3 | null, radius: number, camera: Camera): void {
      if (!Number.isFinite(radius) || radius < 0) {
        throw new RangeError(
          `setGap: parameter "radius" must be finite and >= 0, got ${radius}`,
        );
      }
      if (center === null) {
        gap.uGapR.value = 0;
        return;
      }
      // The renderer refreshes this only in render(), after the loop update.
      camera.updateMatrixWorld();
      gap.uGapC.value.copy(center).applyMatrix4(camera.matrixWorldInverse);
      gap.uGapR.value = radius * ORBIT_GAP_RADIUS_FACTOR;
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
