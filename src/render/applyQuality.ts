import type { QualityLevel } from '@core/quality.ts';
import { STAR_COUNTS } from '@core/starfield.ts';

import {
  createSphereGeometry,
  sphereSegmentsFor,
  type SphereTarget,
} from './sphereFactory.ts';
import { TEXTURE_LIMITS, type TextureLimits } from './textureStore.ts';

// Light level: one rendered pixel per CSS pixel at most (ADR-010 point 9).
export const LOW_QUALITY_PIXEL_RATIO_CAP = 1;

export type QualityTargets = {
  spheres: readonly SphereTarget[];
  starfield: { setCount(count: number): void };
  textureStore: { setLimits(limits: TextureLimits): void };
  view: { setPixelRatioCap(cap: number | null): void };
};

function currentSegments(target: SphereTarget): number | null {
  const parameters = (
    target.mesh.geometry as { parameters?: { widthSegments?: number } }
  ).parameters;
  return parameters?.widthSegments ?? null;
}

/**
 * Applies one quality level to the scene. Safe to call again with the same
 * level. Spheres keep their meshes: only the geometry is replaced, and the old
 * one is disposed, so a level change in a camera flight does not move anything.
 */
export function applyQualityLevel(
  level: QualityLevel,
  targets: QualityTargets,
): void {
  const segments = sphereSegmentsFor(level);
  for (const target of targets.spheres) {
    const wanted = segments[target.kind];
    if (currentSegments(target) === wanted) {
      continue;
    }

    const previous = target.mesh.geometry;
    target.mesh.geometry = createSphereGeometry(target.radius, wanted);
    previous.dispose();
  }

  targets.starfield.setCount(STAR_COUNTS[level]);
  targets.textureStore.setLimits(TEXTURE_LIMITS[level]);
  targets.view.setPixelRatioCap(
    level === 'low' ? LOW_QUALITY_PIXEL_RATIO_CAP : null,
  );
}
