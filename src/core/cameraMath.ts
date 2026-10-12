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

/**
 * How big the whole system should look at the start and in the system view
 * (EMI-241). `widthShare` and `heightShare` are the parts of the window width
 * and height that stay free of panels, measured symmetrically around the
 * window center (where the camera aims); `fill` is the part of that free area
 * the outermost orbit may cover.
 */
export type StartFrame = {
  /** Scene radius of the outermost orbit (Neptune). */
  orbitRadius: number;
  /** Vertical field of view of the camera, in degrees. */
  fovDeg: number;
  widthShare: number;
  heightShare: number;
  fill: number;
};

const FIT_SAMPLES = 128;
const FIT_ITERATIONS = 50;

function requireShare(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw invalidInput('startDistance', name, 'must be in (0, 1]', value);
  }
}

// How far the projected orbit reaches from the window center, sideways and
// vertically, each as a share of half the window, for a camera at `distance`
// looking down at the start polar angle. The orbit is a circle of `radius` in
// the ecliptic plane (scene x-z) around the origin, which the camera aims at.
// Seen from an angle the near side reaches farther down than the far side
// reaches up, so the larger of the two counts: the free area is symmetric.
function projectedOrbitReach(
  out: { width: number; height: number },
  distance: number,
  radius: number,
  tanHalfFov: number,
  aspect: number,
): void {
  const sinPolar = Math.sin(START_POLAR_RAD);
  const cosPolar = Math.cos(START_POLAR_RAD);
  let reachX = 0;
  let reachY = 0;
  for (let k = 0; k < FIT_SAMPLES; k += 1) {
    const angle = (2 * Math.PI * k) / FIT_SAMPLES;
    const depth = distance - radius * Math.sin(angle) * sinPolar;
    const x = (radius * Math.cos(angle)) / (depth * tanHalfFov * aspect);
    const y = (-radius * Math.sin(angle) * cosPolar) / (depth * tanHalfFov);
    reachX = Math.max(reachX, Math.abs(x));
    reachY = Math.max(reachY, Math.abs(y));
  }
  out.width = reachX;
  out.height = reachY;
}

/**
 * The camera distance at which the outermost orbit, seen from the start
 * angle, just fills `frame.fill` of the free area in its tighter direction.
 */
export function fitStartDistance(aspect: number, frame: StartFrame): number {
  requireFinitePositive('fitStartDistance', 'aspect', aspect);
  requireFinitePositive('fitStartDistance', 'orbitRadius', frame.orbitRadius);
  requireFinitePositive('fitStartDistance', 'fovDeg', frame.fovDeg);
  requireShare('widthShare', frame.widthShare);
  requireShare('heightShare', frame.heightShare);
  requireShare('fill', frame.fill);

  const radius = frame.orbitRadius;
  const tanHalfFov = Math.tan((frame.fovDeg * Math.PI) / 360);
  const wantWidth = frame.fill * frame.widthShare;
  const wantHeight = frame.fill * frame.heightShare;
  const shares = { width: 0, height: 0 };
  // Both extents fall as the camera moves away: bisect for the nearest
  // distance at which each one fits, then keep the farther of the two.
  let low = radius;
  let high = radius * 4096;
  for (let iteration = 0; iteration < FIT_ITERATIONS; iteration += 1) {
    const middle = (low + high) / 2;
    projectedOrbitReach(shares, middle, radius, tanHalfFov, aspect);
    if (shares.width <= wantWidth && shares.height <= wantHeight) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return high;
}

export function startDistance(
  aspect: number,
  frame?: StartFrame | null,
): number {
  requireFinitePositive('startDistance', 'aspect', aspect);
  if (frame !== undefined && frame !== null) {
    return fitStartDistance(aspect, frame);
  }
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

/** Edges of the window taken by panels, in CSS px. */
export type ChromeInsets = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/**
 * The share of the window width and height that stays free around the window
 * center, where the camera aims. The free area is cut symmetrically, so the
 * system seen from the camera never reaches under a panel on either side.
 * Returns `null` when no free area is left.
 */
export function centeredFreeShares(
  widthPx: number,
  heightPx: number,
  insets: ChromeInsets,
): { widthShare: number; heightShare: number } | null {
  requireFinitePositive('centeredFreeShares', 'widthPx', widthPx);
  requireFinitePositive('centeredFreeShares', 'heightPx', heightPx);
  const halfWidth = Math.min(
    widthPx / 2 - Math.max(0, insets.left),
    widthPx / 2 - Math.max(0, insets.right),
  );
  const halfHeight = Math.min(
    heightPx / 2 - Math.max(0, insets.top),
    heightPx / 2 - Math.max(0, insets.bottom),
  );
  if (!(halfWidth > 0) || !(halfHeight > 0)) {
    return null;
  }

  return {
    widthShare: Math.min(1, (2 * halfWidth) / widthPx),
    heightShare: Math.min(1, (2 * halfHeight) / heightPx),
  };
}
