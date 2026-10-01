import { Mesh, SphereGeometry, type Material } from 'three';

export const SPHERE_SEGMENTS = {
  planet: 48,
  sun: 64,
} as const;

export function createSphere(
  radius: number,
  segments: number,
  material: Material,
): Mesh {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new RangeError(
      `createSphere: parameter "radius" must be finite and > 0, got ${radius}`,
    );
  }

  if (!Number.isInteger(segments) || segments < 3) {
    throw new RangeError(
      `createSphere: parameter "segments" must be an integer >= 3, got ${segments}`,
    );
  }

  const heightSegments = Math.max(8, Math.round(segments / 2));
  return new Mesh(
    new SphereGeometry(radius, segments, heightSegments),
    material,
  );
}
