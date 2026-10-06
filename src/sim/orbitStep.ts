export const ORBIT_STEP_FADE_DEG = 30;

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

/** Orbit angle stepped between two simulation samples, in degrees. */
export function orbitStepDegrees(
  deltaDays: number,
  periodDays: number,
): number {
  if (!Number.isFinite(deltaDays)) {
    throw invalidInput(
      'orbitStepDegrees',
      'deltaDays',
      'must be finite',
      deltaDays,
    );
  }
  if (!Number.isFinite(periodDays) || periodDays <= 0) {
    throw invalidInput(
      'orbitStepDegrees',
      'periodDays',
      'must be finite and > 0',
      periodDays,
    );
  }

  return (360 * Math.abs(deltaDays)) / periodDays;
}

/** False only when the orbit step is strictly above the fade threshold. */
export function meshIsVisibleForOrbitStep(stepDegrees: number): boolean {
  if (!Number.isFinite(stepDegrees)) {
    throw invalidInput(
      'meshIsVisibleForOrbitStep',
      'stepDegrees',
      'must be finite',
      stepDegrees,
    );
  }

  return stepDegrees <= ORBIT_STEP_FADE_DEG;
}
