import { CAMERA_CONFIG } from './cameraConfig.ts';
import {
  clampPolar,
  easeInOutCubic,
  flightGoalDistance,
  flightProgress,
  startDistance,
  type CameraPose,
} from './cameraMath.ts';

export type FlightKind = 'none' | 'body' | 'system';

/** One preallocated `from` pose. `startFlight` copies into it. */
export type CameraFlight = {
  kind: FlightKind;
  elapsed: number;
  duration: number;
  from: CameraPose;
};

const START_POLAR_RAD = (CAMERA_CONFIG.startPolarDeg * Math.PI) / 180;

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

function requireFiniteAtLeastZero(
  functionName: string,
  parameter: string,
  value: number,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw invalidInput(
      functionName,
      parameter,
      'must be finite and >= 0',
      value,
    );
  }
}

export function createFlight(): CameraFlight {
  return {
    kind: 'none',
    elapsed: 0,
    duration: 0,
    from: {
      azimuth: 0,
      polar: 0,
      distance: 1,
      targetX: 0,
      targetY: 0,
      targetZ: 0,
    },
  };
}

export function startFlight(
  flight: CameraFlight,
  from: CameraPose,
  kind: 'body' | 'system',
  durationSeconds: number,
): void {
  requireFiniteAtLeastZero('startFlight', 'durationSeconds', durationSeconds);
  // Locals so `startFlight(flight, flight.from, …)` cannot clobber itself.
  const azimuth = from.azimuth;
  const polar = from.polar;
  const distance = from.distance;
  const targetX = from.targetX;
  const targetY = from.targetY;
  const targetZ = from.targetZ;
  flight.kind = kind;
  flight.elapsed = 0;
  flight.duration = durationSeconds;
  flight.from.azimuth = azimuth;
  flight.from.polar = polar;
  flight.from.distance = distance;
  flight.from.targetX = targetX;
  flight.from.targetY = targetY;
  flight.from.targetZ = targetZ;
}

/** Eased fraction in [0, 1]. A finished step clears `kind`. */
export function stepFlight(flight: CameraFlight, dtSeconds: number): number {
  requireFiniteAtLeastZero('stepFlight', 'dtSeconds', dtSeconds);
  if (flight.kind === 'none') {
    return 0;
  }

  flight.elapsed += dtSeconds;
  const linear = flightProgress(flight.elapsed, flight.duration);
  const eased = easeInOutCubic(linear);
  if (linear >= 1) {
    flight.kind = 'none';
  }
  return eased;
}

export function isFlightActive(flight: CameraFlight): boolean {
  return (
    flight.kind !== 'none' &&
    flightProgress(flight.elapsed, flight.duration) < 1
  );
}

export function cancelFlight(flight: CameraFlight): void {
  flight.kind = 'none';
}

/**
 * Body goal keeps azimuth and polar from `current` (polar clipped to
 * [10°, 170°]). System goal keeps azimuth, puts polar at the start angle,
 * and aims at the origin from `startDistance(aspect)`.
 */
export function computeGoalPose(
  out: CameraPose,
  kind: 'body' | 'system',
  bodyX: number,
  bodyY: number,
  bodyZ: number,
  displayRadius: number,
  isSun: boolean,
  current: CameraPose,
  aspect: number,
): CameraPose {
  const azimuth = current.azimuth;
  const polar = current.polar;
  if (kind === 'body') {
    if (!Number.isFinite(displayRadius) || displayRadius <= 0) {
      throw invalidInput(
        'computeGoalPose',
        'displayRadius',
        'must be finite and > 0',
        displayRadius,
      );
    }
    out.distance = flightGoalDistance(displayRadius, isSun);
    out.azimuth = azimuth;
    out.polar = clampPolar(polar);
    out.targetX = bodyX;
    out.targetY = bodyY;
    out.targetZ = bodyZ;
    return out;
  }

  out.distance = startDistance(aspect);
  out.azimuth = azimuth;
  out.polar = clampPolar(START_POLAR_RAD);
  out.targetX = 0;
  out.targetY = 0;
  out.targetZ = 0;
  return out;
}
