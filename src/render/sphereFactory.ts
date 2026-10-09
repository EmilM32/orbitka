import { Mesh, SphereGeometry, type Material } from 'three';

import type { QualityLevel } from '@core/quality.ts';

export const SPHERE_SEGMENTS = {
  moon: 32,
  planet: 48,
  sun: 64,
} as const;

// Denser spheres for textured bodies: a smooth edge at the closest zoom
// (64×32, the Sun 96×48, moons 32×16). The low level goes back to
// SPHERE_SEGMENTS (applyQuality.ts).
export const SPHERE_SEGMENTS_DETAILED = {
  moon: 32,
  planet: 64,
  sun: 96,
} as const;

export type SphereKind = keyof typeof SPHERE_SEGMENTS;

/** A body sphere whose geometry follows the quality level. */
export type SphereTarget = { mesh: Mesh; radius: number; kind: SphereKind };

export function sphereSegmentsFor(
  level: QualityLevel,
): Record<SphereKind, number> {
  return level === 'low' ? SPHERE_SEGMENTS : SPHERE_SEGMENTS_DETAILED;
}

export function createSphereGeometry(
  radius: number,
  segments: number,
): SphereGeometry {
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
  return new SphereGeometry(radius, segments, heightSegments);
}

export function createSphere(
  radius: number,
  segments: number,
  material: Material,
): Mesh {
  return new Mesh(createSphereGeometry(radius, segments), material);
}
