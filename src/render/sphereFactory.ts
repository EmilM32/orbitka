import { Mesh, SphereGeometry, type Material } from 'three';

export const SPHERE_SEGMENTS = {
  moon: 32,
  planet: 48,
  sun: 64,
} as const;

// Denser spheres for textured bodies: a smooth edge at the closest zoom
// (64×32, the Sun 96×48, moons 32×16). The low level goes back to
// SPHERE_SEGMENTS (EMI-223).
export const SPHERE_SEGMENTS_DETAILED = {
  moon: 32,
  planet: 64,
  sun: 96,
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
