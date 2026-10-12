// Gravity wells for the gravity view (EMI-264, ADR-004 addendum). The grid is
// a picture, not a measurement: with the real potential the Sun's well would
// hide every planet's well, so each body gets a funnel whose depth grows with
// its mass to a small power and whose width follows its scene radius. Every
// tuning constant lives in WELL. Inputs and outputs are scene units.
//
// The force and velocity arrows (EMI-265) are measurements: acceleration and
// speed in physical units, and only the arrow length is compressed (ARROW).

import type { BodyDef } from '@data/types.ts';

import { distanceToScene, radiusToScene, type Vec3 } from './scale.ts';

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

// Force and velocity arrows at the planets (EMI-265). An arrow's length in
// scene units is ref · (value / value at Earth)^exponent, clamped to
// [min, max]. The exponents are small because the values span a lot: the
// Sun pulls Mercury about 10 000 times harder than Neptune, and Mercury at
// perihelion is 11 times faster than Neptune. The velocity exponent is larger
// so the speed-up at perihelion stays visible on Mercury and Mars.
export const ARROW = {
  forceRefMs2: 5.93e-3, // the Sun's pull on Earth at 1 AU, m/s²
  forceRefLength: 2.8, // force arrow of Earth
  forceExponent: 0.15, // Mercury at perihelion ≈ 4, Neptune ≈ 1
  forceMin: 0.8,
  forceMax: 4.5,
  velocityRefKms: 29.78, // Earth's mean orbital speed, km/s
  velocityRefLength: 3, // velocity arrow of Earth
  velocityExponent: 0.7, // Mercury at perihelion ≈ 4.8, Neptune ≈ 0.9
  velocityMin: 0.8,
  velocityMax: 6.5,
} as const;

// Newton's constant in m³/(kg·s²) (CODATA 2018). Masses in bodies.json are in
// 10^24 kg.
export const GRAVITATIONAL_CONSTANT = 6.6743e-11;
const MASS_UNIT_KG = 1e24;
// IAU 2012 astronomical unit.
export const AU_M = 149_597_870_700;
const SECONDS_PER_DAY = 86_400;

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

/**
 * The Sun's gravitational acceleration at `positionAu` (relative to the Sun,
 * AU) for a Sun of `starMass` (10^24 kg), in m/s². It points at the Sun and
 * its size is G·M / r². The pull of the other planets is left out, like the
 * perturbations in the orbits (ADR-003). Writes into `out`.
 */
export function accelerationAt(
  positionAu: Vec3,
  starMass: number,
  out: Vec3,
): Vec3 {
  if (!Number.isFinite(starMass) || starMass <= 0) {
    throw invalidInput(
      'accelerationAt',
      'starMass',
      'must be finite and > 0',
      starMass,
    );
  }
  const { x, y, z } = positionAu;
  const distanceAu = Math.hypot(x, y, z);
  if (!Number.isFinite(distanceAu) || distanceAu <= 0) {
    throw invalidInput(
      'accelerationAt',
      'positionAu',
      'must be finite and away from the Sun',
      distanceAu,
    );
  }

  const distanceM = distanceAu * AU_M;
  const size =
    (GRAVITATIONAL_CONSTANT * starMass * MASS_UNIT_KG) /
    (distanceM * distanceM);
  // −size · r̂, with r̂ = position / distance.
  const factor = -size / distanceAu;
  out.x = x * factor;
  out.y = y * factor;
  out.z = z * factor;
  return out;
}

/** A speed in AU per day as km/s. */
export function auPerDayToKms(auPerDay: number): number {
  if (!Number.isFinite(auPerDay)) {
    throw invalidInput('auPerDayToKms', 'auPerDay', 'must be finite', auPerDay);
  }
  return (auPerDay * AU_M) / 1000 / SECONDS_PER_DAY;
}

function arrowLength(
  functionName: string,
  value: number,
  ref: number,
  refLength: number,
  exponent: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value) || value < 0) {
    throw invalidInput(functionName, 'value', 'must be finite and >= 0', value);
  }
  return clamp(refLength * (value / ref) ** exponent, min, max);
}

/** Scene length of the force arrow for an acceleration in m/s². */
export function forceArrowLength(accelerationMs2: number): number {
  return arrowLength(
    'forceArrowLength',
    accelerationMs2,
    ARROW.forceRefMs2,
    ARROW.forceRefLength,
    ARROW.forceExponent,
    ARROW.forceMin,
    ARROW.forceMax,
  );
}

/** Scene length of the velocity arrow for a speed in km/s. */
export function velocityArrowLength(speedKms: number): number {
  return arrowLength(
    'velocityArrowLength',
    speedKms,
    ARROW.velocityRefKms,
    ARROW.velocityRefLength,
    ARROW.velocityExponent,
    ARROW.velocityMin,
    ARROW.velocityMax,
  );
}
