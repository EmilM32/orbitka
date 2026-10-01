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
