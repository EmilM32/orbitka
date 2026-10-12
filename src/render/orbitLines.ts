import {
  BufferGeometry,
  DynamicDrawUsage,
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
// A hovered body (list, rail or scene) lights its orbit: lighter and more
// opaque than the other states, never yellow (yellow is selection).
export const ORBIT_COLOR_HOVERED = 0xc9d6f2;
export const ORBIT_OPACITY_HOVERED = 0.9;
// ADR-010 point 10: no orbit line is drawn closer than 1.25 R to the line of
// sight through the selected body's center.
export const ORBIT_GAP_RADIUS_FACTOR = 1.25;

// The trail behind a body (EMI-249): the line is brighter right behind the
// body and fades out over about 105° of the orbit, nothing ahead of it.
export const ORBIT_TRAIL_LENGTH = 105 / 360;
export const ORBIT_TRAIL_BOOST = 0.8;

export type OrbitLines = {
  group: Group;
  /**
   * Where the body of orbit `id` is along its line (`orbitPhase`, 0 to 1) and
   * how strong its trail is (0 to 1; 0 while the body mesh is faded for a
   * large time step). Called every frame; it does not allocate.
   */
  setBodyTrail: (id: string, phase: number, strength: number) => void;
  setOrbitLinesVisible: (visible: boolean) => void;
  setSelectedBody: (id: string | null) => void;
  /** The orbit of the hovered body is lit; the selected orbit keeps its own look. */
  setHoveredBody: (id: string | null) => void;
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

// The weight of the trail at each line point is computed on the CPU (a few
// hundred points per line, no trigonometry) and drawn from a vertex attribute:
// the three orbit materials are shared by all lines, and three.js uploads the
// uniforms of a shared material once per material, not once per line.
const TRAIL_VERTEX_HEAD = `attribute float aTrail;
varying float vTrail;
void main() {`;
const TRAIL_VERTEX_BODY = `#include <project_vertex>
\tvTrail = aTrail;`;
const TRAIL_FRAGMENT_HEAD = `varying float vTrail;
void main() {`;
const TRAIL_FRAGMENT_BODY = `#include <color_fragment>
\tdiffuseColor.a = min( 1.0, diffuseColor.a * ( 1.0 + ${ORBIT_TRAIL_BOOST.toFixed(3)} * vTrail ) );
\tdiffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0 ), 0.3 * vTrail );`;

export function patchOrbitTrail(
  shader: WebGLProgramParametersWithUniforms,
): void {
  shader.vertexShader = replaceOnce(
    replaceOnce(shader.vertexShader, 'void main() {', TRAIL_VERTEX_HEAD),
    '#include <project_vertex>',
    TRAIL_VERTEX_BODY,
  );
  shader.fragmentShader = replaceOnce(
    replaceOnce(shader.fragmentShader, 'void main() {', TRAIL_FRAGMENT_HEAD),
    '#include <color_fragment>',
    TRAIL_FRAGMENT_BODY,
  );
}

/**
 * Trail weight of a point that lies `behind` turns behind the body (in the
 * direction of motion): 1 right behind it, easing to 0 at `ORBIT_TRAIL_LENGTH`,
 * 0 beyond that and everywhere ahead of the body.
 */
export function trailWeight(behind: number): number {
  if (!(behind >= 0) || behind >= ORBIT_TRAIL_LENGTH) {
    return 0;
  }
  const t = behind / ORBIT_TRAIL_LENGTH;
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Fills `out` with the trail weight of each of its points, for a body at
 * orbit fraction `phase`. Point `k` of `n` is at `k / n` of the orbit.
 */
export function fillTrailWeights(
  out: Float32Array,
  phase: number,
  strength: number,
): void {
  const count = out.length;
  for (let k = 0; k < count; k += 1) {
    const behind = phase - k / count;
    out[k] = strength * trailWeight(behind - Math.floor(behind));
  }
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
  color = ORBIT_COLOR,
): LineBasicMaterial {
  const material = new LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  // On each material, not through scene.traverse: dimmed and selected are
  // attached to the lines only after a selection (SPEC §9.2).
  material.onBeforeCompile = (shader) => {
    patchOrbitGap(shader, uniforms);
    patchOrbitTrail(shader);
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
  const hovered = createOrbitMaterial(
    ORBIT_OPACITY_HOVERED,
    gap,
    ORBIT_COLOR_HOVERED,
  );
  const materials = [normal, dimmed, selected, hovered];
  const lines: LineLoop[] = [];
  const trails = new Map<
    string,
    {
      weights: Float32Array;
      attribute: Float32BufferAttribute;
      phase: number;
      strength: number;
    }
  >();
  let disposed = false;
  let selectedId: string | null = null;
  let hoveredId: string | null = null;

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

    const hoveredName =
      hoveredId === null || hoveredId === 'sun' ? '' : `orbit-${hoveredId}`;
    for (const line of lines) {
      if (found && line.name === selectedName) {
        line.material = selected;
      } else if (line.name === hoveredName) {
        line.material = hovered;
      } else {
        line.material = found ? dimmed : normal;
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
      // The attribute copies what it is given: write into its own array.
      const attribute = new Float32BufferAttribute(
        new Float32Array(ORBIT_SEGMENTS),
        1,
      );
      const weights = attribute.array as Float32Array;
      attribute.setUsage(DynamicDrawUsage);
      geometry.setAttribute('aTrail', attribute);
      const line = new LineLoop(geometry, normal);
      line.name = `orbit-${def.id}`;
      trails.set(def.id, { weights, attribute, phase: 0, strength: 0 });
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
    setBodyTrail(id: string, phase: number, strength: number): void {
      const trail = trails.get(id);
      if (disposed || trail === undefined) {
        return;
      }
      if (trail.phase === phase && trail.strength === strength) {
        return;
      }
      trail.phase = phase;
      trail.strength = strength;
      fillTrailWeights(trail.weights, phase, strength);
      trail.attribute.needsUpdate = true;
    },
    setSelectedBody(id: string | null): void {
      if (disposed) {
        return;
      }
      selectedId = id;
      applyMaterials();
    },
    setHoveredBody(id: string | null): void {
      if (disposed || id === hoveredId) {
        return;
      }
      hoveredId = id;
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
