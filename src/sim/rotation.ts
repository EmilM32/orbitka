// The renderer applies this angle around local +Y, then tilts by axialTiltDeg
// around Z. Tilt is measured from the scene Y axis (the ecliptic normal), not
// from each planet's true orbit normal (at most about 7 degrees, ADR-003).
// Every axis tilts toward scene -X, which does not match the real poles.

export const ROTATION_FADE_START_RPS = 1;
export const ROTATION_FADE_END_RPS = 2;
export const ROTATION_MAX_STEP_SECONDS = 0.1;

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

function requireFinite(
  functionName: string,
  parameter: string,
  value: number,
): void {
  if (!Number.isFinite(value)) {
    throw invalidInput(functionName, parameter, 'must be finite', value);
  }
}

function requirePositivePeriod(
  functionName: string,
  periodHours: number,
): void {
  if (!Number.isFinite(periodHours) || periodHours <= 0) {
    throw invalidInput(
      functionName,
      'periodHours',
      'must be finite and > 0',
      periodHours,
    );
  }
}

function fractionTurns(turns: number): number {
  let fraction = turns - Math.floor(turns);
  if (fraction >= 1) {
    fraction = 0;
  }
  return fraction;
}

function wrapAngle(angleRad: number): number {
  return fractionTurns(angleRad / TWO_PI) * TWO_PI;
}

// Maps a radian delta into (-π, π].
function signedHalfTurn(delta: number): number {
  const wrapped = wrapAngle(delta);
  return wrapped > Math.PI ? wrapped - TWO_PI : wrapped;
}

export function spinAngleRad(
  daysSinceJ2000: number,
  periodHours: number,
): number {
  requireFinite('spinAngleRad', 'daysSinceJ2000', daysSinceJ2000);
  requirePositivePeriod('spinAngleRad', periodHours);
  return fractionTurns((daysSinceJ2000 * 24) / periodHours) * TWO_PI;
}

export function rotationsPerSecond(
  daysPerSecond: number,
  periodHours: number,
): number {
  requireFinite('rotationsPerSecond', 'daysPerSecond', daysPerSecond);
  requirePositivePeriod('rotationsPerSecond', periodHours);
  return (Math.abs(daysPerSecond) * 24) / periodHours;
}

export function rotationFadeFactor(rotationsPerSecond: number): number {
  if (!Number.isFinite(rotationsPerSecond) || rotationsPerSecond < 0) {
    throw invalidInput(
      'rotationFadeFactor',
      'rotationsPerSecond',
      'must be finite and >= 0',
      rotationsPerSecond,
    );
  }

  const span = ROTATION_FADE_END_RPS - ROTATION_FADE_START_RPS;
  const t = Math.min(
    1,
    Math.max(0, (rotationsPerSecond - ROTATION_FADE_START_RPS) / span),
  );
  return 1 - t * t * (3 - 2 * t);
}

export function advanceSpinAngleRad(
  angleRad: number,
  prevDays: number,
  days: number,
  periodHours: number,
  daysPerSecond: number,
): number {
  requireFinite('advanceSpinAngleRad', 'angleRad', angleRad);
  requireFinite('advanceSpinAngleRad', 'prevDays', prevDays);
  requireFinite('advanceSpinAngleRad', 'days', days);
  requirePositivePeriod('advanceSpinAngleRad', periodHours);
  requireFinite('advanceSpinAngleRad', 'daysPerSecond', daysPerSecond);

  const dayDelta = Math.abs(days - prevDays);
  if (dayDelta === 0) {
    return wrapAngle(angleRad);
  }

  const frameLimit =
    Math.abs(daysPerSecond) * ROTATION_MAX_STEP_SECONDS * (1 + 1e-9);
  if (dayDelta <= frameLimit) {
    const delta = signedHalfTurn(
      spinAngleRad(days, periodHours) - spinAngleRad(prevDays, periodHours),
    );
    const fade = rotationFadeFactor(
      rotationsPerSecond(daysPerSecond, periodHours),
    );
    return wrapAngle(angleRad + delta * fade);
  }

  return spinAngleRad(days, periodHours);
}
