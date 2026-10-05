import type {
  BodyDef,
  HelioOrbitDef,
  MoonOrbitDef,
  OrbitDef,
} from '@data/types.ts';

import type { Vec3 } from './scale.ts';

const TWO_PI = Math.PI * 2;

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

function normalizeMeanAnomaly(meanAnomalyRad: number): number {
  const wrapped = meanAnomalyRad % TWO_PI;
  if (wrapped > Math.PI) {
    return wrapped - TWO_PI;
  }
  if (wrapped <= -Math.PI) {
    return wrapped + TWO_PI;
  }
  return wrapped;
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Solves Kepler's equation M = E − e·sin E by Newton's method.
 * M and E are in radians. For e = 0, returns M in (−π, π].
 */
export function solveKepler(
  meanAnomalyRad: number,
  eccentricity: number,
  tolerance = 1e-10,
  maxIterations = 50,
): number {
  if (!Number.isFinite(meanAnomalyRad)) {
    throw invalidInput(
      'solveKepler',
      'meanAnomalyRad',
      'must be finite',
      meanAnomalyRad,
    );
  }

  if (!(eccentricity >= 0 && eccentricity < 1)) {
    throw invalidInput(
      'solveKepler',
      'e',
      'must satisfy 0 <= e < 1',
      eccentricity,
    );
  }

  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw invalidInput(
      'solveKepler',
      'tolerance',
      'must be finite and > 0',
      tolerance,
    );
  }

  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw invalidInput(
      'solveKepler',
      'maxIterations',
      'must be an integer and >= 1',
      maxIterations,
    );
  }

  const meanAnomaly = normalizeMeanAnomaly(meanAnomalyRad);
  if (eccentricity === 0) {
    return meanAnomaly;
  }

  let eccentricAnomaly =
    eccentricity < 0.8 ? meanAnomaly : meanAnomaly >= 0 ? Math.PI : -Math.PI;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const sine = Math.sin(eccentricAnomaly);
    const cosine = Math.cos(eccentricAnomaly);
    const delta =
      (eccentricAnomaly - eccentricity * sine - meanAnomaly) /
      (1 - eccentricity * cosine);
    eccentricAnomaly -= delta;
    if (Math.abs(delta) < tolerance) {
      return eccentricAnomaly;
    }
  }

  throw new Error(
    `solveKepler: failed to converge for M=${meanAnomalyRad}, e=${eccentricity} after ${maxIterations} iterations`,
  );
}

function requireDays(def: BodyDef, daysSinceJ2000: number): void {
  if (!Number.isFinite(daysSinceJ2000)) {
    throw new RangeError(
      `bodyPositionAu: parameter "daysSinceJ2000" of body "${def.id}" must be finite, got ${daysSinceJ2000}`,
    );
  }
}

function requireOrbitNumber(
  def: BodyDef,
  field: keyof HelioOrbitDef | keyof MoonOrbitDef,
  value: number,
  requirement: string,
  valid: boolean,
): void {
  if (valid) {
    return;
  }

  throw new RangeError(
    `bodyPositionAu: parameter "orbit.${field}" of body "${def.id}" ${requirement}, got ${value}`,
  );
}

/**
 * Position of a body on a Keplerian orbit.
 * Planets, dwarf planets, and belts: `orbit.semiMajorAxisAu`, result in AU
 * relative to the Sun.
 * A moon (`type === 'moon'`): `orbit.semiMajorAxisKm`, result in kilometers
 * relative to the parent body (no unit conversion).
 * Writes the result into `out`.
 */
export function bodyPositionAu(
  def: BodyDef,
  daysSinceJ2000: number,
  out: Vec3,
): Vec3 {
  requireDays(def, daysSinceJ2000);

  const orbit = def.orbit;
  if (orbit === undefined) {
    if (def.type === 'star' || def.type === 'belt') {
      out.x = 0;
      out.y = 0;
      out.z = 0;
      return out;
    }

    throw new RangeError(
      `bodyPositionAu: body "${def.id}" of type ${def.type} has no orbit`,
    );
  }

  requireOrbitNumber(
    def,
    'periodDays',
    orbit.periodDays,
    'must be finite and > 0',
    Number.isFinite(orbit.periodDays) && orbit.periodDays > 0,
  );
  const axisField = def.type === 'moon' ? 'semiMajorAxisKm' : 'semiMajorAxisAu';
  // A missing axis field reads as NaN, so the check below names it.
  const semiMajor =
    (def.type === 'moon'
      ? def.orbit?.semiMajorAxisKm
      : def.orbit?.semiMajorAxisAu) ?? Number.NaN;
  requireOrbitNumber(
    def,
    axisField,
    semiMajor,
    'must be finite and > 0',
    Number.isFinite(semiMajor) && semiMajor > 0,
  );

  const angles = [
    'inclinationDeg',
    'longitudeAscendingNodeDeg',
    'argumentPeriapsisDeg',
    'meanAnomalyAtEpochDeg',
  ] as const satisfies readonly (keyof OrbitDef)[];

  for (const field of angles) {
    requireOrbitNumber(
      def,
      field,
      orbit[field],
      'must be finite',
      Number.isFinite(orbit[field]),
    );
  }

  requireOrbitNumber(
    def,
    'eccentricity',
    orbit.eccentricity,
    'must satisfy 0 <= e < 1',
    orbit.eccentricity >= 0 && orbit.eccentricity < 1,
  );

  const meanAnomaly =
    radians(orbit.meanAnomalyAtEpochDeg) +
    (TWO_PI * daysSinceJ2000) / orbit.periodDays;
  const eccentricAnomaly = solveKepler(meanAnomaly, orbit.eccentricity);
  const cosE = Math.cos(eccentricAnomaly);
  const sinE = Math.sin(eccentricAnomaly);
  const eccentricity = orbit.eccentricity;
  const xPrime = semiMajor * (cosE - eccentricity);
  const yPrime = semiMajor * Math.sqrt(1 - eccentricity * eccentricity) * sinE;

  const omega = radians(orbit.argumentPeriapsisDeg);
  const node = radians(orbit.longitudeAscendingNodeDeg);
  const inclination = radians(orbit.inclinationDeg);
  const cosOmega = Math.cos(omega);
  const sinOmega = Math.sin(omega);
  const cosNode = Math.cos(node);
  const sinNode = Math.sin(node);
  const cosInc = Math.cos(inclination);
  const sinInc = Math.sin(inclination);

  out.x =
    (cosOmega * cosNode - sinOmega * sinNode * cosInc) * xPrime +
    (-sinOmega * cosNode - cosOmega * sinNode * cosInc) * yPrime;
  out.y =
    (cosOmega * sinNode + sinOmega * cosNode * cosInc) * xPrime +
    (-sinOmega * sinNode + cosOmega * cosNode * cosInc) * yPrime;
  out.z = sinOmega * sinInc * xPrime + cosOmega * sinInc * yPrime;
  return out;
}
