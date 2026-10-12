// Gravity wells for the gravity view (EMI-264, ADR-004 addendum). The grid is
// a picture, not a measurement: with the real potential the Sun's well would
// hide every planet's well, so each body gets a funnel whose depth grows with
// its mass to a small power and whose width follows its scene radius. Every
// tuning constant lives in WELL. Inputs and outputs are scene units.

import type { BodyDef } from '@data/types.ts';

import { distanceToScene, radiusToScene } from './scale.ts';

export const WELL = {
  depth: 8, // depth of a one-solar-mass well: depth · (mass / Sun)^massExponent
  massExponent: 0.13, // Jupiter ≈ 3.2, Earth ≈ 1.5, Mercury ≈ 1 scene unit
  widthFactor: 3, // funnel width = widthFactor · scene radius of the body
  widthMin: 1.8, // narrower funnels fall between the grid lines
  widthMax: 4, // the Sun's funnel; its scene radius is clamped at 3.4
  reachWidths: 4, // a planet's funnel ends this many widths from its center
  maxDepth: 12, // no point of the grid lies deeper below its plane
  planeOffset: 1, // the grid plane lies this far below the orbit plane
  gridMargin: 1.15, // grid radius = margin · farthest aphelion in the scene
} as const;

/** One body's funnel. `x` and `y` are its place in the ecliptic plane. */
export interface Well {
  id: string;
  depth: number;
  width: number;
  /** Distance from the center at which the funnel reaches zero. */
  reach: number;
  x: number;
  y: number;
}

function invalidInput(
  functionName: string,
  parameter: string,
  requirement: string,
  value: number,
): RangeError {
  return new RangeError(
    `${functionName}: parameter "${parameter}" ${requirement}, got ${value}`,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Depth of a well for `massRatio` = body mass / Sun mass. */
export function wellDepthForMass(massRatio: number): number {
  if (!Number.isFinite(massRatio) || massRatio <= 0) {
    throw invalidInput(
      'wellDepthForMass',
      'massRatio',
      'must be finite and > 0',
      massRatio,
    );
  }

  return WELL.depth * massRatio ** WELL.massExponent;
}

/** Funnel width for a body of scene radius `sceneRadius`. */
export function wellWidth(sceneRadius: number): number {
  if (!Number.isFinite(sceneRadius) || sceneRadius <= 0) {
    throw invalidInput(
      'wellWidth',
      'sceneRadius',
      'must be finite and > 0',
      sceneRadius,
    );
  }

  return clamp(WELL.widthFactor * sceneRadius, WELL.widthMin, WELL.widthMax);
}

/**
 * Radius of the grid: the farthest aphelion of a planet in scene units, with
 * a margin, so every orbit lies on the grid.
 */
export function gridRadius(defs: readonly BodyDef[]): number {
  let farthest = 0;
  for (const def of defs) {
    if (def.type !== 'planet' || def.orbit === undefined) {
      continue;
    }
    const { semiMajorAxisAu, eccentricity } = def.orbit;
    farthest = Math.max(
      farthest,
      distanceToScene(semiMajorAxisAu * (1 + eccentricity)),
    );
  }

  if (farthest === 0) {
    throw new RangeError('gridRadius: parameter "defs" has no planet orbit');
  }

  return WELL.gridMargin * farthest;
}

/**
 * The Sun's well and one well for each planet, at the origin until placed.
 * A planet carries the mass of its moons; moons have no well of their own.
 * The Sun's funnel reaches `starReach` (the grid radius).
 */
export function createWells(
  defs: readonly BodyDef[],
  starReach: number,
): Well[] {
  if (!Number.isFinite(starReach) || starReach <= 0) {
    throw invalidInput(
      'createWells',
      'starReach',
      'must be finite and > 0',
      starReach,
    );
  }

  const star = defs.find((def) => def.type === 'star');
  if (star?.mass === undefined) {
    throw new RangeError('createWells: the star has no mass');
  }

  const wells: Well[] = [];
  for (const def of defs) {
    if (def.type !== 'star' && def.type !== 'planet') {
      continue;
    }
    if (def.mass === undefined) {
      throw new RangeError(`createWells: body "${def.id}" has no mass`);
    }

    let mass = def.mass;
    for (const moon of defs) {
      if (moon.parentId === def.id && moon.mass !== undefined) {
        mass += moon.mass;
      }
    }
    const width = wellWidth(radiusToScene(def.radiusKm));
    wells.push({
      id: def.id,
      depth: wellDepthForMass(mass / star.mass),
      width,
      reach: def.type === 'star' ? starReach : WELL.reachWidths * width,
      x: 0,
      y: 0,
    });
  }

  return wells;
}

/**
 * Depth of one funnel at `distance` from its center: the potential of a
 * softened point mass, 1 / √(1 + u²) with u = distance / width, shifted and
 * stretched so it is `well.depth` at the center and 0 from `well.reach` on.
 */
export function wellProfile(distance: number, well: Well): number {
  if (!(distance >= 0) || !Number.isFinite(distance)) {
    throw invalidInput(
      'wellProfile',
      'distance',
      'must be finite and >= 0',
      distance,
    );
  }

  if (distance >= well.reach) {
    return 0;
  }

  const u = distance / well.width;
  const edgeU = well.reach / well.width;
  const edge = 1 / Math.sqrt(1 + edgeU * edgeU);
  const value = 1 / Math.sqrt(1 + u * u);
  return (well.depth * (value - edge)) / (1 - edge);
}

/**
 * Adds the depth of every well to `out` for the points (`xs[i]`, `ys[i]`).
 * Points outside a well's reach are skipped by a box test, so a grid of tens
 * of thousands of points updates in well under a millisecond. Allocates
 * nothing; the caller clamps with `clampDepths` after the last call.
 */
export function addWellDepths(
  xs: Float32Array,
  ys: Float32Array,
  wells: readonly Well[],
  out: Float32Array,
): void {
  if (xs.length !== ys.length || xs.length !== out.length) {
    throw invalidInput(
      'addWellDepths',
      'out',
      `must have the length of xs and ys (${xs.length}, ${ys.length})`,
      out.length,
    );
  }

  for (const well of wells) {
    const { x, y, reach } = well;
    for (let index = 0; index < xs.length; index += 1) {
      const dx = (xs[index] ?? 0) - x;
      if (dx >= reach || dx <= -reach) {
        continue;
      }
      const dy = (ys[index] ?? 0) - y;
      if (dy >= reach || dy <= -reach) {
        continue;
      }
      const distance = Math.hypot(dx, dy);
      if (distance < reach) {
        out[index] = (out[index] ?? 0) + wellProfile(distance, well);
      }
    }
  }
}

/** Limits every depth to WELL.maxDepth. */
export function clampDepths(depths: Float32Array): void {
  for (let index = 0; index < depths.length; index += 1) {
    if ((depths[index] ?? 0) > WELL.maxDepth) {
      depths[index] = WELL.maxDepth;
    }
  }
}

/** Total depth at one point, clamped. For tests and single samples. */
export function wellDepthAt(
  x: number,
  y: number,
  wells: readonly Well[],
): number {
  let depth = 0;
  for (const well of wells) {
    depth += wellProfile(Math.hypot(x - well.x, y - well.y), well);
  }
  return Math.min(depth, WELL.maxDepth);
}
