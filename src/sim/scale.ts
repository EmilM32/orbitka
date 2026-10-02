// Simplified scene scale (ADR-004). Every tuning constant lives in SCALE.
export const SCALE = {
  k: 8, // distance multiplier: d = k · AU^0.5
  c: 0.015, // size multiplier: r = c · radiusKm^0.4
  radiusMin: 0.25, // lower bound of a body radius in the scene
  radiusMax: 3.4, // upper bound; must stay below Mercury perihelion (4.44) − 1.0
  moonOrbitBase: 1.5, // smallest moon distance = base · planet radius in the scene
  moonOrbitFactor: 0.03, // factor on (distance / planet radius)^exponent
  moonOrbitExponent: 0.7, // exponent of the moon's distance from the planet
  radiusExponent: 0.4, // size exponent: r = c · radiusKm^radiusExponent
  moonRadiusC: 0.008, // moon size multiplier: r = C · radiusKm^radiusExponent
  moonRadiusMin: 0.05, // lower bound of a moon radius in the scene
  moonRadiusMax: 0.4, // upper bound of a moon radius in the scene
  // Largest fraction of a neighbor gap (or the gap to the parent) that one
  // moon may occupy. Two neighbors then sum to at most the gap, so the
  // spheres cannot intersect. Smaller values are visual tuning only.
  moonGapFraction: 0.5,
} as const;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function requireFinite(
  functionName: string,
  parameter: string,
  value: number,
): void {
  if (!Number.isFinite(value)) {
    throw invalidInput(functionName, parameter, 'must be finite', value);
  }
}

// A component square overflows before Math.hypot (near 1e154).
function requirePositionComponent(parameter: string, value: number): void {
  if (!Number.isFinite(value) || !Number.isFinite(value * value)) {
    throw invalidInput(
      'compressPositionAu',
      parameter,
      'must be finite and must not overflow',
      value,
    );
  }
}

export function distanceToScene(au: number): number {
  requireFinite('distanceToScene', 'au', au);
  if (au < 0) {
    throw invalidInput('distanceToScene', 'au', 'must be >= 0', au);
  }

  return au > 0 ? SCALE.k * Math.sqrt(au) : 0;
}

export function radiusToScene(km: number): number {
  requireFinite('radiusToScene', 'km', km);
  if (km <= 0) {
    throw invalidInput('radiusToScene', 'km', 'must be > 0', km);
  }

  return clamp(
    SCALE.c * km ** SCALE.radiusExponent,
    SCALE.radiusMin,
    SCALE.radiusMax,
  );
}

export function moonDistanceToScene(
  distanceKm: number,
  parentRadiusKm: number,
): number {
  requireFinite('moonDistanceToScene', 'distanceKm', distanceKm);
  if (!Number.isFinite(parentRadiusKm) || parentRadiusKm <= 0) {
    throw invalidInput(
      'moonDistanceToScene',
      'parentRadiusKm',
      'must be finite and > 0',
      parentRadiusKm,
    );
  }

  if (distanceKm < 0) {
    throw invalidInput(
      'moonDistanceToScene',
      'distanceKm',
      'must be >= 0',
      distanceKm,
    );
  }

  if (distanceKm === 0) {
    return 0;
  }

  const spread =
    SCALE.moonOrbitFactor *
    (distanceKm / parentRadiusKm) ** SCALE.moonOrbitExponent;
  return radiusToScene(parentRadiusKm) * (SCALE.moonOrbitBase + spread);
}

export function moonRadiusToScene(km: number): number {
  requireFinite('moonRadiusToScene', 'km', km);
  if (km <= 0) {
    throw invalidInput('moonRadiusToScene', 'km', 'must be > 0', km);
  }

  return clamp(
    SCALE.moonRadiusC * km ** SCALE.radiusExponent,
    SCALE.moonRadiusMin,
    SCALE.moonRadiusMax,
  );
}

// Keeps the vector direction and replaces its length with distanceToScene(|r|).
// Length uses Math.hypot, not x*x, which overflows or zeroes the direction.
// Writes into out so the render loop does not allocate.
export function compressPositionAu(
  x: number,
  y: number,
  z: number,
  out: Vec3,
): Vec3 {
  requirePositionComponent('x', x);
  requirePositionComponent('y', y);
  requirePositionComponent('z', z);

  const lengthAu = Math.hypot(x, y, z);
  const factor = lengthAu > 0 ? distanceToScene(lengthAu) / lengthAu : 0;

  out.x = x * factor;
  out.y = y * factor;
  out.z = z * factor;
  return out;
}

// Keeps the direction of a moon's offset from its parent (kilometers) and
// replaces the length with moonDistanceToScene. Math.hypot avoids x*x overflow.
// Writes into out so a later render loop does not allocate.
export function compressMoonOffsetKm(
  x: number,
  y: number,
  z: number,
  parentRadiusKm: number,
  out: Vec3,
): Vec3 {
  requireFinite('compressMoonOffsetKm', 'x', x);
  requireFinite('compressMoonOffsetKm', 'y', y);
  requireFinite('compressMoonOffsetKm', 'z', z);
  if (!Number.isFinite(parentRadiusKm) || parentRadiusKm <= 0) {
    throw invalidInput(
      'compressMoonOffsetKm',
      'parentRadiusKm',
      'must be finite and > 0',
      parentRadiusKm,
    );
  }

  const lengthKm = Math.hypot(x, y, z);
  if (!Number.isFinite(lengthKm)) {
    throw invalidInput('compressMoonOffsetKm', 'x', 'must not overflow', x);
  }

  if (lengthKm === 0) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }

  const sceneLength = moonDistanceToScene(lengthKm, parentRadiusKm);
  if (!Number.isFinite(sceneLength)) {
    throw invalidInput(
      'compressMoonOffsetKm',
      'x',
      'must produce a finite scene offset',
      x,
    );
  }

  const factor = sceneLength / lengthKm;
  out.x = x * factor;
  out.y = y * factor;
  out.z = z * factor;
  return out;
}

type MoonOrbitRange = {
  index: number;
  axisKm: number;
  peri: number;
  apo: number;
};

// Scene periapsis and apoapsis of one moon. moonDistanceToScene is increasing,
// so the extremes of a*(1∓e) stay the extremes in the scene.
function moonOrbitRangeScene(
  axisKm: number,
  eccentricity: number,
  parentRadiusKm: number,
): { peri: number; apo: number } {
  return {
    peri: moonDistanceToScene(axisKm * (1 - eccentricity), parentRadiusKm),
    apo: moonDistanceToScene(axisKm * (1 + eccentricity), parentRadiusKm),
  };
}

function requireMoonCount(
  parameter: string,
  length: number,
  expected: number,
): void {
  if (length !== expected) {
    throw invalidInput(
      'moonRadiiToScene',
      parameter,
      `must have length ${expected}`,
      length,
    );
  }
}

function requirePositiveFinite(parameter: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw invalidInput(
      'moonRadiiToScene',
      parameter,
      'must be finite and > 0',
      value,
    );
  }
}

function requireEccentricity(parameter: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw invalidInput(
      'moonRadiiToScene',
      parameter,
      'must be in the range [0, 1)',
      value,
    );
  }
}

function requireUniqueAxes(semiMajorAxesKm: readonly number[]): void {
  for (let index = 0; index < semiMajorAxesKm.length; index += 1) {
    const axis = semiMajorAxesKm[index];
    if (axis === undefined) {
      continue;
    }
    for (let earlier = 0; earlier < index; earlier += 1) {
      if (axis === semiMajorAxesKm[earlier]) {
        throw invalidInput(
          'moonRadiiToScene',
          `semiMajorAxesKm[${index}]`,
          'must be unique',
          axis,
        );
      }
    }
  }
}

function moonRanges(
  semiMajorAxesKm: readonly number[],
  eccentricities: readonly number[],
  parentRadiusKm: number,
): MoonOrbitRange[] {
  const ranges: MoonOrbitRange[] = [];

  for (let index = 0; index < semiMajorAxesKm.length; index += 1) {
    const axisKm = semiMajorAxesKm[index];
    const eccentricity = eccentricities[index];
    if (axisKm === undefined || eccentricity === undefined) {
      continue;
    }
    const range = moonOrbitRangeScene(axisKm, eccentricity, parentRadiusKm);
    ranges.push({ index, axisKm, peri: range.peri, apo: range.apo });
  }

  return ranges;
}

function gapToNeighbors(
  sorted: readonly MoonOrbitRange[],
  place: number,
  parentRadiusKm: number,
): number {
  const current = sorted[place];
  if (current === undefined) {
    throw invalidInput(
      'moonRadiiToScene',
      'semiMajorAxesKm',
      'must be an array',
      place,
    );
  }

  let gap = Number.POSITIVE_INFINITY;
  const outer = sorted[place + 1];
  const inner = sorted[place - 1];

  if (outer !== undefined) {
    const separation = outer.peri - current.apo;
    if (separation <= 0) {
      throw invalidInput(
        'moonRadiiToScene',
        `semiMajorAxesKm[${current.index}]`,
        'must not overlap the next orbit',
        current.apo,
      );
    }
    gap = Math.min(gap, separation);
  }

  if (inner !== undefined) {
    const separation = current.peri - inner.apo;
    if (separation <= 0) {
      throw invalidInput(
        'moonRadiiToScene',
        `semiMajorAxesKm[${current.index}]`,
        'must not overlap the previous orbit',
        current.peri,
      );
    }
    gap = Math.min(gap, separation);
  } else {
    const clearance = current.peri - radiusToScene(parentRadiusKm);
    if (clearance <= 0) {
      throw invalidInput(
        'moonRadiiToScene',
        `semiMajorAxesKm[${current.index}]`,
        'must stay outside the parent',
        current.peri,
      );
    }
    gap = Math.min(gap, clearance);
  }

  return gap;
}

// Radii of one parent's moons, in input order. The gap rule wins over
// SCALE.moonRadiusMin: a moon may be smaller than that floor so neighbors
// do not intersect at periapsis or apoapsis.
export function moonRadiiToScene(
  semiMajorAxesKm: readonly number[],
  eccentricities: readonly number[],
  radiiKm: readonly number[],
  parentRadiusKm: number,
): number[] {
  const count = semiMajorAxesKm.length;
  requireMoonCount('eccentricities', eccentricities.length, count);
  requireMoonCount('radiiKm', radiiKm.length, count);
  if (count === 0) {
    return [];
  }

  if (!Number.isFinite(parentRadiusKm) || parentRadiusKm <= 0) {
    throw invalidInput(
      'moonRadiiToScene',
      'parentRadiusKm',
      'must be finite and > 0',
      parentRadiusKm,
    );
  }

  for (let index = 0; index < count; index += 1) {
    requirePositiveFinite(
      `semiMajorAxesKm[${index}]`,
      semiMajorAxesKm[index] ?? Number.NaN,
    );
    requireEccentricity(
      `eccentricities[${index}]`,
      eccentricities[index] ?? Number.NaN,
    );
    requirePositiveFinite(`radiiKm[${index}]`, radiiKm[index] ?? Number.NaN);
  }
  requireUniqueAxes(semiMajorAxesKm);

  const sorted = moonRanges(semiMajorAxesKm, eccentricities, parentRadiusKm);
  sorted.sort((left, right) => left.axisKm - right.axisKm);

  const gaps: number[] = [];
  for (let place = 0; place < sorted.length; place += 1) {
    const current = sorted[place];
    if (current === undefined) {
      continue;
    }
    gaps[current.index] = gapToNeighbors(sorted, place, parentRadiusKm);
  }

  const radii: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const gap = gaps[index];
    const radiusKm = radiiKm[index];
    if (gap === undefined || radiusKm === undefined) {
      throw invalidInput(
        'moonRadiiToScene',
        `radiiKm[${index}]`,
        'must have a gap',
        radiusKm ?? Number.NaN,
      );
    }
    // Do not raise the result back to moonRadiusMin. The gap rule only shrinks.
    radii.push(
      Math.min(moonRadiusToScene(radiusKm), SCALE.moonGapFraction * gap),
    );
  }

  return radii;
}
