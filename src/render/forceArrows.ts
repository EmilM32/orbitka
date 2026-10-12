import {
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Mesh,
  type PerspectiveCamera,
  type WebGLProgramParametersWithUniforms,
} from 'three';

import { VIEW_CONFIG } from '@core/viewConfig.ts';
import type { BodyDef } from '@data/types.ts';
import {
  accelerationAt,
  auPerDayToKms,
  forceArrowLength,
  velocityArrowLength,
} from '@sim/gravity.ts';
import { bodyPositionAu, bodyVelocityAuPerDay } from '@sim/kepler.ts';
import { compressVelocityAu, type Vec3 } from '@sim/scale.ts';

import { eclipticToScene } from './coords.ts';

// The arrows of the gravity view (EMI-265): at each planet the Sun's pull
// (solid shaft) and the velocity (dashed shaft). Lengths come from ARROW in
// src/sim/gravity.ts; widths are screen pixels, so an arrow is as thick
// zoomed out as zoomed in. Each arrow starts at the planet's surface.
//
// Every shaft, dash, and head is one instance of a single open cylinder, so
// all arrows take one draw call. A head is the cylinder narrowed to a point
// by the per-instance attribute `aTaper` (0 = shaft, 1 = head).
export const FORCE_ARROW_PX = {
  shaft: 3,
  headWidth: 11,
  headLength: 14,
} as const;
// A head takes at most this share of its arrow, and is at most this much
// wider than long, so a short arrow keeps the shape of an arrow.
export const FORCE_ARROW_HEAD_SHARE = 0.4;
export const FORCE_ARROW_HEAD_ASPECT = 0.8;
// Dashes of the velocity shaft and the share of the shaft they cover.
export const VELOCITY_DASHES = 4;
export const VELOCITY_DASH_FILL = 0.6;
// Closer to the camera than FIT, an arrow shrinks with the camera distance:
// it keeps its size on screen instead of reaching past the camera. Farther
// than FAR it grows with the distance, up to FAR_GROWTH times, so the arrows
// of the outer planets stay readable in the whole-system view. There every
// planet is past FAR · FAR_GROWTH, so all arrows share one factor and their
// lengths compare exactly.
export const FORCE_ARROW_FIT_DISTANCE = 12;
export const FORCE_ARROW_FAR_DISTANCE = 40;
export const FORCE_ARROW_FAR_GROWTH = 1.6;
// After the orbit lines, the rings, and the Sun's glow. The arrows ignore the
// depth buffer: the pull on Mercury points into the Sun, and its head must
// stay in sight.
export const FORCE_ARROW_RENDER_ORDER = 3;

// Instances of one planet, in this order.
export const ARROW_PART = {
  forceShaft: 0,
  forceHead: 1,
  velocityHead: 2,
  /** The first of VELOCITY_DASHES dashes, from the planet outwards. */
  velocityDash: 3,
} as const;
export const INSTANCES_PER_PLANET = ARROW_PART.velocityDash + VELOCITY_DASHES;

/** Physical values of one planet in the last update. */
export type PlanetMotion = {
  accelerationMs2: number;
  speedKms: number;
};

export type ForceArrows = {
  /** One instanced mesh for every arrow. */
  mesh: InstancedMesh;
  group: Group;
  isVisible(): boolean;
  setVisible(visible: boolean): void;
  /**
   * Places the arrows for the simulation time. The camera and the viewport
   * height in CSS pixels set the arrow width. Allocates nothing.
   */
  update(
    daysSinceJ2000: number,
    camera: PerspectiveCamera,
    viewportHeightPx: number,
  ): void;
  /** Writes the values of planet `id` from the last update; false if none. */
  readMotion(id: string, out: PlanetMotion): boolean;
  dispose(): void;
};

type PlanetArrows = {
  def: BodyDef;
  mesh: Mesh;
  radius: number;
  motion: PlanetMotion;
  hasMotion: boolean;
};

/** Length factor of the arrows of a planet `distance` from the camera. */
export function arrowFit(distance: number): number {
  if (distance < FORCE_ARROW_FIT_DISTANCE) {
    return Math.max(0, distance) / FORCE_ARROW_FIT_DISTANCE;
  }
  return Math.min(
    FORCE_ARROW_FAR_GROWTH,
    Math.max(1, distance / FORCE_ARROW_FAR_DISTANCE),
  );
}

function replaceOnce(source: string, anchor: string, next: string): string {
  if (!source.includes(anchor)) {
    throw new Error(`force arrows patch: shader has no "${anchor}"`);
  }
  return source.replace(anchor, next);
}

/** Narrows a head instance from its base (y = 0) to a point (y = 1). */
export function patchForceArrows(
  shader: WebGLProgramParametersWithUniforms,
): void {
  shader.vertexShader = replaceOnce(
    replaceOnce(
      shader.vertexShader,
      'void main() {',
      'attribute float aTaper;\nvoid main() {',
    ),
    '#include <begin_vertex>',
    '#include <begin_vertex>\n\ttransformed.xz *= 1.0 - aTaper * position.y;',
  );
}

export function createForceArrows(
  defs: readonly BodyDef[],
  meshes: ReadonlyMap<string, Mesh>,
  radii: ReadonlyMap<string, number>,
): ForceArrows {
  const star = defs.find((def) => def.type === 'star');
  if (star?.mass === undefined) {
    throw new Error('createForceArrows: the star has no mass');
  }
  const starMass = star.mass;

  const planets: PlanetArrows[] = [];
  for (const def of defs) {
    if (def.type !== 'planet' || def.orbit === undefined) {
      continue;
    }
    const mesh = meshes.get(def.id);
    const radius = radii.get(def.id);
    if (mesh === undefined || radius === undefined) {
      throw new Error(`createForceArrows: missing mesh for body "${def.id}"`);
    }
    planets.push({
      def,
      mesh,
      radius,
      motion: { accelerationMs2: 0, speedKms: 0 },
      hasMotion: false,
    });
  }

  const count = planets.length * INSTANCES_PER_PLANET;
  // Unit piece along +y from 0 to 1, diameter 1.
  const geometry = new CylinderGeometry(0.5, 0.5, 1, 12, 1, true);
  geometry.translate(0, 0.5, 0);
  const taper = new Float32Array(count);
  geometry.setAttribute('aTaper', new InstancedBufferAttribute(taper, 1));
  const material = new MeshBasicMaterial({
    color: 0xffffff,
    side: DoubleSide,
    // A transparent double-sided mesh is drawn in two passes otherwise.
    forceSinglePass: true,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
  material.onBeforeCompile = (shader) => {
    patchForceArrows(shader);
  };

  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = 'force-arrows';
  mesh.renderOrder = FORCE_ARROW_RENDER_ORDER;
  // Instances spread over the whole system; one bound would cull them all.
  mesh.frustumCulled = false;
  // The arrows take no part in picking: a click goes through them.
  mesh.raycast = () => undefined;

  const forceColor = new Color(VIEW_CONFIG.forceArrowColor);
  const velocityColor = new Color(VIEW_CONFIG.velocityArrowColor);
  const hidden = new Matrix4().makeScale(0, 0, 0);
  for (let planet = 0; planet < planets.length; planet += 1) {
    const first = planet * INSTANCES_PER_PLANET;
    for (let part = 0; part < INSTANCES_PER_PLANET; part += 1) {
      const isForce =
        part === ARROW_PART.forceShaft || part === ARROW_PART.forceHead;
      mesh.setColorAt(first + part, isForce ? forceColor : velocityColor);
      mesh.setMatrixAt(first + part, hidden);
    }
    taper[first + ARROW_PART.forceHead] = 1;
    taper[first + ARROW_PART.velocityHead] = 1;
  }

  const group = new Group();
  group.name = 'force-arrows';
  group.visible = false;
  group.add(mesh);

  // Scratch objects: update() allocates nothing.
  const positionAu: Vec3 = { x: 0, y: 0, z: 0 };
  const velocityAu: Vec3 = { x: 0, y: 0, z: 0 };
  const acceleration: Vec3 = { x: 0, y: 0, z: 0 };
  const sceneVelocity: Vec3 = { x: 0, y: 0, z: 0 };
  const direction = new Vector3();
  const start = new Vector3();
  const place = new Vector3();
  const size = new Vector3();
  const up = new Vector3(0, 1, 0);
  const turn = new Quaternion();
  const matrix = new Matrix4();
  let disposed = false;

  function setPiece(
    index: number,
    from: number,
    length: number,
    width: number,
  ): void {
    place.copy(direction).multiplyScalar(from).add(start);
    size.set(width, length, width);
    matrix.compose(place, turn, size);
    mesh.setMatrixAt(index, matrix);
  }

  // One arrow along `direction` (unit) from `start`. Returns the shaft length.
  function placeHead(index: number, length: number, pixel: number): number {
    const headLength = Math.min(
      FORCE_ARROW_PX.headLength * pixel,
      FORCE_ARROW_HEAD_SHARE * length,
    );
    const headWidth = Math.min(
      FORCE_ARROW_PX.headWidth * pixel,
      FORCE_ARROW_HEAD_ASPECT * headLength,
    );
    const shaftLength = length - headLength;
    turn.setFromUnitVectors(up, direction);
    setPiece(index, shaftLength, headLength, headWidth);
    return shaftLength;
  }

  function update(
    daysSinceJ2000: number,
    camera: PerspectiveCamera,
    viewportHeightPx: number,
  ): void {
    if (disposed || !group.visible) {
      return;
    }

    // World size of one CSS pixel at unit distance from the camera.
    const pixelPerDistance =
      viewportHeightPx > 0
        ? (2 * Math.tan((camera.fov * Math.PI) / 360)) /
          (viewportHeightPx * camera.zoom)
        : 0;
    const period = 1 / VELOCITY_DASHES;
    const dash = period * VELOCITY_DASH_FILL;

    for (let planet = 0; planet < planets.length; planet += 1) {
      const entry = planets[planet];
      if (entry === undefined) {
        continue;
      }
      const { def, radius, motion } = entry;
      const first = planet * INSTANCES_PER_PLANET;
      bodyPositionAu(def, daysSinceJ2000, positionAu);
      bodyVelocityAuPerDay(def, daysSinceJ2000, velocityAu);
      accelerationAt(positionAu, starMass, acceleration);
      motion.accelerationMs2 = Math.hypot(
        acceleration.x,
        acceleration.y,
        acceleration.z,
      );
      motion.speedKms = auPerDayToKms(
        Math.hypot(velocityAu.x, velocityAu.y, velocityAu.z),
      );
      entry.hasMotion = true;

      // The arrows go out with the body when the time step is too large to
      // follow (EMI-249), and with a zero-size viewport.
      if (!entry.mesh.visible || pixelPerDistance === 0) {
        for (let part = 0; part < INSTANCES_PER_PLANET; part += 1) {
          mesh.setMatrixAt(first + part, hidden);
        }
        continue;
      }

      const distance = camera.position.distanceTo(entry.mesh.position);
      const pixel = distance * pixelPerDistance;
      const fit = arrowFit(distance);
      const shaftWidth = FORCE_ARROW_PX.shaft * pixel;

      // The pull is radial, so the scene keeps its direction.
      eclipticToScene(acceleration, direction).normalize();
      start.copy(direction).multiplyScalar(radius).add(entry.mesh.position);
      const forceShaft = placeHead(
        first + ARROW_PART.forceHead,
        fit * forceArrowLength(motion.accelerationMs2),
        pixel,
      );
      setPiece(first + ARROW_PART.forceShaft, 0, forceShaft, shaftWidth);

      // Along the orbit as drawn: the compressed orbit's tangent.
      compressVelocityAu(positionAu, velocityAu, sceneVelocity);
      eclipticToScene(sceneVelocity, direction).normalize();
      start.copy(direction).multiplyScalar(radius).add(entry.mesh.position);
      const velocityShaft = placeHead(
        first + ARROW_PART.velocityHead,
        fit * velocityArrowLength(motion.speedKms),
        pixel,
      );
      // A gap at the planet, the last dash ends at the head.
      for (let index = 0; index < VELOCITY_DASHES; index += 1) {
        setPiece(
          first + ARROW_PART.velocityDash + index,
          (index * period + period - dash) * velocityShaft,
          dash * velocityShaft,
          shaftWidth,
        );
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    mesh,
    group,
    isVisible() {
      return group.visible;
    },
    setVisible(visible) {
      if (disposed) {
        return;
      }
      group.visible = visible;
      if (!visible) {
        for (const entry of planets) {
          entry.hasMotion = false;
        }
      }
    },
    update,
    readMotion(id, out) {
      if (disposed || !group.visible) {
        return false;
      }
      for (const entry of planets) {
        if (entry.def.id === id) {
          if (!entry.hasMotion) {
            return false;
          }
          out.accelerationMs2 = entry.motion.accelerationMs2;
          out.speedKms = entry.motion.speedKms;
          return true;
        }
      }
      return false;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      group.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
