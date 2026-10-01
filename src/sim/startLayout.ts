import type { BodyDef, OrbitDef } from '@data/types.ts';

import type { Vec3 } from './scale.ts';

const ORBIT_ANGLE_FIELDS = [
  'longitudeAscendingNodeDeg',
  'argumentPeriapsisDeg',
  'meanAnomalyAtEpochDeg',
] as const satisfies readonly (keyof OrbitDef)[];

// Tymczasowy układ J2000: okrąg o promieniu a i kącie θ = Ω + ω + M₀.
// EMI-110 zastępuje tę funkcję solverem Keplera.
export function circularStartPositionAu(def: BodyDef, out: Vec3): Vec3 {
  const orbit = def.orbit;

  if (orbit === undefined) {
    throw new Error(`circularStartPositionAu: ciało „${def.id}” nie ma orbit`);
  }

  if (!Number.isFinite(orbit.semiMajorAxisAu) || orbit.semiMajorAxisAu <= 0) {
    throw new RangeError(
      `circularStartPositionAu: parametr „semiMajorAxisAu” ciała „${def.id}” musi być skończony i > 0, otrzymano ${orbit.semiMajorAxisAu}`,
    );
  }

  for (const field of ORBIT_ANGLE_FIELDS) {
    const value = orbit[field];
    if (!Number.isFinite(value)) {
      throw new RangeError(
        `circularStartPositionAu: parametr „${field}” ciała „${def.id}” musi być skończony, otrzymano ${value}`,
      );
    }
  }

  const thetaRadians =
    ((orbit.longitudeAscendingNodeDeg +
      orbit.argumentPeriapsisDeg +
      orbit.meanAnomalyAtEpochDeg) *
      Math.PI) /
    180;

  out.x = orbit.semiMajorAxisAu * Math.cos(thetaRadians);
  out.y = orbit.semiMajorAxisAu * Math.sin(thetaRadians);
  out.z = 0;
  return out;
}
