import {
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  type Camera,
} from 'three';

import { STARFIELD_SEED, generateStarfield } from '@core/starfield.ts';

import { CAMERA_FAR } from './camera.ts';

// Inside camera.far around the camera, so no star is clipped.
export const STARFIELD_RADIUS = 0.9 * CAMERA_FAR;
// Drawn first, behind everything else.
export const STARFIELD_RENDER_ORDER = -10;

export type StarfieldMesh = {
  points: Points;
  setCount(count: number): void;
  update(camera: Camera): void;
  dispose(): void;
};

function buildGeometry(count: number): BufferGeometry {
  const stars = generateStarfield(count, STARFIELD_SEED, STARFIELD_RADIUS);
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const value = stars.brightness[index] ?? 0;
    colors[index * 3] = value;
    colors[index * 3 + 1] = value;
    colors[index * 3 + 2] = value;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(stars.positions, 3),
  );
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('starSize', new Float32BufferAttribute(stars.sizes, 1));
  geometry.setDrawRange(0, count);
  return geometry;
}

// PointsMaterial has one size for every point; each star brings its own.
function patchStarSize(material: PointsMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute float starSize;\nvoid main() {')
      .replace('gl_PointSize = size;', 'gl_PointSize = size * starSize;');
  };
}

/**
 * Background stars "at infinity": the points follow the camera position (not
 * its rotation), so a flight does not move them against each other.
 */
export function createStarfield(count: number): StarfieldMesh {
  let geometry = buildGeometry(count);
  let capacity = count;
  const material = new PointsMaterial({
    size: 1,
    sizeAttenuation: false,
    depthWrite: false,
    vertexColors: true,
    transparent: true,
  });
  patchStarSize(material);

  const points = new Points(geometry, material);
  points.name = 'starfield';
  points.frustumCulled = false;
  points.renderOrder = STARFIELD_RENDER_ORDER;
  points.raycast = () => {};
  let disposed = false;

  return {
    points,
    setCount(next: number): void {
      if (disposed) {
        return;
      }
      if (!Number.isInteger(next) || next < 0) {
        throw new RangeError(
          `setCount: parameter "count" must be an integer >= 0, got ${next}`,
        );
      }
      if (next === geometry.drawRange.count) {
        return;
      }
      // The same seed gives the same first stars, so a smaller count only
      // draws fewer of them.
      if (next <= capacity) {
        geometry.setDrawRange(0, next);
        return;
      }
      geometry.dispose();
      geometry = buildGeometry(next);
      capacity = next;
      points.geometry = geometry;
    },
    update(camera: Camera): void {
      points.position.copy(camera.position);
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      points.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
