import { CAMERA_CONFIG } from './cameraConfig.ts';

export type CameraPose = {
  azimuth: number;
  polar: number;
  distance: number;
  targetX: number;
  targetY: number;
  targetZ: number;
};

export type DistanceLimits = {
  min: number;
  max: number;
};

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

const POLAR_MIN_RAD = (CAMERA_CONFIG.polarMinDeg * Math.PI) / 180;
const POLAR_MAX_RAD = (CAMERA_CONFIG.polarMaxDeg * Math.PI) / 180;
const START_POLAR_RAD = (CAMERA_CONFIG.startPolarDeg * Math.PI) / 180;
const START_AZIMUTH_RAD = (CAMERA_CONFIG.startAzimuthDeg * Math.PI) / 180;

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

function requireFinitePositive(
  functionName: string,
  parameter: string,
  value: number,
): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw invalidInput(
      functionName,
      parameter,
      'must be finite and > 0',
      value,
    );
  }
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

function requireUnitInterval(
  functionName: string,
  parameter: string,
  value: number,
): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw invalidInput(functionName, parameter, 'must be within [0, 1]', value);
  }
}

function requireLimits(functionName: string, limits: DistanceLimits): void {
  requireFinite(functionName, 'min', limits.min);
  requireFinite(functionName, 'max', limits.max);
  if (limits.min > limits.max) {
    throw new RangeError(
      `${functionName}: parameter "limits" must satisfy min <= max, got min=${limits.min} max=${limits.max}`,
    );
  }
}

function requirePose(functionName: string, pose: CameraPose): void {
  requireFinite(functionName, 'azimuth', pose.azimuth);
  requireFinite(functionName, 'polar', pose.polar);
  requireFinite(functionName, 'distance', pose.distance);
  requireFinite(functionName, 'targetX', pose.targetX);
  requireFinite(functionName, 'targetY', pose.targetY);
  requireFinite(functionName, 'targetZ', pose.targetZ);
}

export function startDistance(aspect: number): number {
  requireFinitePositive('startDistance', 'aspect', aspect);
  const multiplier = Math.max(1, CAMERA_CONFIG.startDistanceAspect / aspect);
  return CAMERA_CONFIG.startDistanceBase * multiplier;
}

export function setDefaultPose(out: CameraPose, aspect: number): CameraPose {
  const distance = startDistance(aspect);
  out.azimuth = START_AZIMUTH_RAD;
  out.polar = START_POLAR_RAD;
  out.distance = distance;
  out.targetX = 0;
  out.targetY = 0;
  out.targetZ = 0;
  return out;
}

export function systemDistanceLimits(
  out: DistanceLimits,
  startDist: number,
): DistanceLimits {
  requireFinitePositive('systemDistanceLimits', 'startDist', startDist);
  out.min = CAMERA_CONFIG.systemZoomMinFactor * startDist;
  out.max = CAMERA_CONFIG.systemZoomMaxFactor * startDist;
  return out;
}

export function bodyDistanceLimits(
  out: DistanceLimits,
  startDist: number,
  displayRadius: number,
): DistanceLimits {
  requireFinitePositive('bodyDistanceLimits', 'startDist', startDist);
  requireFinitePositive('bodyDistanceLimits', 'displayRadius', displayRadius);
  const min = CAMERA_CONFIG.bodyZoomMinRadiusFactor * displayRadius;
  if (min > startDist) {
    throw invalidInput(
      'bodyDistanceLimits',
      'displayRadius',
      'must be <= startDist / 2.5',
      displayRadius,
    );
  }
  out.min = min;
  out.max = startDist;
  return out;
}

export function flightGoalDistance(
  displayRadius: number,
  isSun: boolean,
): number {
  requireFinitePositive('flightGoalDistance', 'displayRadius', displayRadius);
  const factor = isSun
    ? CAMERA_CONFIG.sunDistanceRadiusFactor
    : CAMERA_CONFIG.bodyDistanceRadiusFactor;
  return displayRadius * factor;
}

/**
 * How much farther the body frame sits when a panel covers part of the window
 * (ADR-009 annex): the body keeps the share of the free area it has in the
 * full window. Insets are clamped so the free area is at least 1 px.
 */
export function freeAreaDistanceFactor(
  widthPx: number,
  heightPx: number,
  insetRightPx: number,
  insetBottomPx: number,
): number {
  requireFinitePositive('freeAreaDistanceFactor', 'widthPx', widthPx);
  requireFinitePositive('freeAreaDistanceFactor', 'heightPx', heightPx);
  requireFiniteAtLeastZero(
    'freeAreaDistanceFactor',
    'insetRightPx',
    insetRightPx,
  );
  requireFiniteAtLeastZero(
    'freeAreaDistanceFactor',
    'insetBottomPx',
    insetBottomPx,
  );
  const freeWidth = Math.max(1, widthPx - insetRightPx);
  const freeHeight = Math.max(1, heightPx - insetBottomPx);
  return Math.max(1, widthPx / freeWidth, heightPx / freeHeight);
}

export function clampPolar(polar: number): number {
  requireFinite('clampPolar', 'polar', polar);
  if (polar < POLAR_MIN_RAD) {
    return POLAR_MIN_RAD;
  }
  if (polar > POLAR_MAX_RAD) {
    return POLAR_MAX_RAD;
  }
  return polar;
}

export function clampDistance(
  distance: number,
  limits: DistanceLimits,
): number {
  requireFinite('clampDistance', 'distance', distance);
  requireLimits('clampDistance', limits);
  if (distance < limits.min) {
    return limits.min;
  }
  if (distance > limits.max) {
    return limits.max;
  }
  return distance;
}

/** Result is in (-pi, pi]. */
export function wrapAzimuth(azimuth: number): number {
  requireFinite('wrapAzimuth', 'azimuth', azimuth);
  const twoPi = Math.PI * 2;
  let wrapped = azimuth % twoPi;
  if (wrapped > Math.PI) {
    wrapped -= twoPi;
  } else if (wrapped <= -Math.PI) {
    wrapped += twoPi;
  }
  return wrapped;
}

export function rotatePose(
  pose: CameraPose,
  dAzimuth: number,
  dPolar: number,
): CameraPose {
  requirePose('rotatePose', pose);
  requireFinite('rotatePose', 'dAzimuth', dAzimuth);
  requireFinite('rotatePose', 'dPolar', dPolar);
  pose.azimuth = wrapAzimuth(pose.azimuth + dAzimuth);
  pose.polar = clampPolar(pose.polar + dPolar);
  return pose;
}

export function zoomDistance(
  distance: number,
  factor: number,
  limits: DistanceLimits,
): number {
  requireFinite('zoomDistance', 'distance', distance);
  requireFinitePositive('zoomDistance', 'factor', factor);
  requireLimits('zoomDistance', limits);
  const scaled = distance * factor;
  if (!Number.isFinite(scaled)) {
    throw invalidInput('zoomDistance', 'distance', 'must be finite', scaled);
  }
  return clampDistance(scaled, limits);
}

/**
 * Moves `proposed` toward `limits` without stepping farther away.
 * A value already outside the range is not snapped to the boundary.
 */
export function softClampDistance(
  current: number,
  proposed: number,
  limits: DistanceLimits,
): number {
  requireFinite('softClampDistance', 'current', current);
  requireFinite('softClampDistance', 'proposed', proposed);
  requireLimits('softClampDistance', limits);
  if (current >= limits.min && current <= limits.max) {
    return clampDistance(proposed, limits);
  }
  if (current > limits.max) {
    if (proposed < limits.min) {
      return limits.min;
    }
    return Math.min(proposed, current);
  }
  if (proposed > limits.max) {
    return limits.max;
  }
  return Math.max(proposed, current);
}

export function poseToPosition(out: Vec3, pose: CameraPose): Vec3 {
  requirePose('poseToPosition', pose);
  const sinPolar = Math.sin(pose.polar);
  const cosPolar = Math.cos(pose.polar);
  out.x = pose.targetX + pose.distance * sinPolar * Math.sin(pose.azimuth);
  out.y = pose.targetY + pose.distance * cosPolar;
  out.z = pose.targetZ + pose.distance * sinPolar * Math.cos(pose.azimuth);
  return out;
}

export function positionToPose(
  out: CameraPose,
  position: Vec3,
  target: Vec3,
): CameraPose {
  requireFinite('positionToPose', 'x', position.x);
  requireFinite('positionToPose', 'y', position.y);
  requireFinite('positionToPose', 'z', position.z);
  requireFinite('positionToPose', 'targetX', target.x);
  requireFinite('positionToPose', 'targetY', target.y);
  requireFinite('positionToPose', 'targetZ', target.z);
  const dx = position.x - target.x;
  const dy = position.y - target.y;
  const dz = position.z - target.z;
  const distance = Math.hypot(dx, dy, dz);
  out.distance = distance;
  out.targetX = target.x;
  out.targetY = target.y;
  out.targetZ = target.z;
  if (distance === 0) {
    out.polar = 0;
    out.azimuth = 0;
    return out;
  }
  const cosPolar = Math.min(1, Math.max(-1, dy / distance));
  out.polar = Math.acos(cosPolar);
  out.azimuth = Math.atan2(dx, dz);
  return out;
}

export function easeInOutCubic(t: number): number {
  requireUnitInterval('easeInOutCubic', 't', t);
  if (t < 0.5) {
    return 4 * t * t * t;
  }
  const mirrored = -2 * t + 2;
  return 1 - (mirrored * mirrored * mirrored) / 2;
}

export function flightProgress(
  elapsedSeconds: number,
  durationSeconds: number,
): number {
  requireFiniteAtLeastZero('flightProgress', 'elapsedSeconds', elapsedSeconds);
  requireFiniteAtLeastZero(
    'flightProgress',
    'durationSeconds',
    durationSeconds,
  );
  if (durationSeconds === 0) {
    return 1;
  }
  const progress = elapsedSeconds / durationSeconds;
  return progress < 1 ? progress : 1;
}

export function lerp(a: number, b: number, t: number): number {
  requireFinite('lerp', 'a', a);
  requireFinite('lerp', 'b', b);
  requireFinite('lerp', 't', t);
  return a + (b - a) * t;
}

/** Shortest-arc blend. Endpoints stay exact; the middle takes the short way. */
export function lerpAngle(a: number, b: number, t: number): number {
  requireFinite('lerpAngle', 'a', a);
  requireFinite('lerpAngle', 'b', b);
  requireFinite('lerpAngle', 't', t);
  if (t === 0) {
    return a;
  }
  if (t === 1) {
    return b;
  }
  return a + wrapAzimuth(b - a) * t;
}

export function blendPose(
  out: CameraPose,
  from: CameraPose,
  to: CameraPose,
  t: number,
): CameraPose {
  requireUnitInterval('blendPose', 't', t);
  requirePose('blendPose', from);
  requirePose('blendPose', to);

  const fromAzimuth = from.azimuth;
  const toAzimuth = to.azimuth;
  const fromPolar = from.polar;
  const toPolar = to.polar;
  const fromDistance = from.distance;
  const toDistance = to.distance;
  const fromTargetX = from.targetX;
  const toTargetX = to.targetX;
  const fromTargetY = from.targetY;
  const toTargetY = to.targetY;
  const fromTargetZ = from.targetZ;
  const toTargetZ = to.targetZ;

  if (t === 0) {
    out.azimuth = fromAzimuth;
    out.polar = fromPolar;
    out.distance = fromDistance;
    out.targetX = fromTargetX;
    out.targetY = fromTargetY;
    out.targetZ = fromTargetZ;
    return out;
  }
  if (t === 1) {
    out.azimuth = toAzimuth;
    out.polar = toPolar;
    out.distance = toDistance;
    out.targetX = toTargetX;
    out.targetY = toTargetY;
    out.targetZ = toTargetZ;
    return out;
  }

  out.azimuth = lerpAngle(fromAzimuth, toAzimuth, t);
  out.polar = lerp(fromPolar, toPolar, t);
  out.distance = lerp(fromDistance, toDistance, t);
  out.targetX = lerp(fromTargetX, toTargetX, t);
  out.targetY = lerp(fromTargetY, toTargetY, t);
  out.targetZ = lerp(fromTargetZ, toTargetZ, t);
  return out;
}

export function dampingFraction(dtSeconds: number): number {
  requireFiniteAtLeastZero('dampingFraction', 'dtSeconds', dtSeconds);
  const retained = 1 - CAMERA_CONFIG.dampingFactor;
  const steps = CAMERA_CONFIG.dampingReferenceFps * dtSeconds;
  return 1 - retained ** steps;
}
