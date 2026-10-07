import { CAMERA_CONFIG } from './cameraConfig.ts';

/** Wheel sample. Structural so `core` does not take a `WheelEvent`. */
export type WheelSample = {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
};

/** `trackpad` is scroll, not a zoom step. */
export type WheelKind = 'notch' | 'trackpad' | 'pinch';

export type WheelGestureMode = 'idle' | 'mouse' | 'trackpad';

export type WheelGestureState = {
  mode: WheelGestureMode;
  lastTimeMs: number;
};

export type RotationDelta = {
  dAzimuth: number;
  dPolar: number;
};

const MAX_WHEEL_STEPS = 5;

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

export function isTap(movePx: number, durationMs: number): boolean {
  requireFinite('isTap', 'movePx', movePx);
  requireFinite('isTap', 'durationMs', durationMs);
  return (
    movePx < CAMERA_CONFIG.tapMaxMovePx &&
    durationMs < CAMERA_CONFIG.tapMaxDurationMs
  );
}

export function createWheelGestureState(): WheelGestureState {
  return { mode: 'idle', lastTimeMs: Number.NEGATIVE_INFINITY };
}

/**
 * Locks mouse vs trackpad at the first event of a gesture and keeps that
 * mode until a gap of at least `wheelGestureGapMs`. `ctrlKey` is always pinch.
 */
export function classifyWheel(
  state: WheelGestureState,
  sample: WheelSample,
  timeStampMs: number,
): WheelKind {
  requireFinite('classifyWheel', 'deltaX', sample.deltaX);
  requireFinite('classifyWheel', 'deltaY', sample.deltaY);
  requireFinite('classifyWheel', 'deltaMode', sample.deltaMode);
  requireFinite('classifyWheel', 'timeStampMs', timeStampMs);

  if (
    state.mode !== 'idle' &&
    timeStampMs - state.lastTimeMs >= CAMERA_CONFIG.wheelGestureGapMs
  ) {
    state.mode = 'idle';
  }
  state.lastTimeMs = timeStampMs;

  if (sample.ctrlKey) {
    return 'pinch';
  }

  if (state.mode === 'idle') {
    state.mode = startingMode(sample);
  }
  return state.mode === 'mouse' ? 'notch' : 'trackpad';
}

export function wheelZoomFactor(kind: WheelKind, sample: WheelSample): number {
  requireFinite('wheelZoomFactor', 'deltaX', sample.deltaX);
  requireFinite('wheelZoomFactor', 'deltaY', sample.deltaY);
  requireFinite('wheelZoomFactor', 'deltaMode', sample.deltaMode);

  if (kind === 'notch') {
    if (sample.deltaY > 0) {
      return CAMERA_CONFIG.zoomStepOut;
    }
    if (sample.deltaY < 0) {
      return CAMERA_CONFIG.zoomStepIn;
    }
    return 1;
  }

  if (kind === 'pinch') {
    const steps = clampSteps(sample.deltaY / CAMERA_CONFIG.pinchDeltaPerStep);
    return CAMERA_CONFIG.zoomStepOut ** steps;
  }

  // Trackpad scroll orbits; it must not become a notch zoom.
  return 1;
}

/** Grab-drag: both axes are `-2π · pixels / height`. Writes into `out`. */
export function dragToRotation(
  out: RotationDelta,
  dxPx: number,
  dyPx: number,
  heightPx: number,
): RotationDelta {
  requireFinite('dragToRotation', 'dxPx', dxPx);
  requireFinite('dragToRotation', 'dyPx', dyPx);
  requireFinitePositive('dragToRotation', 'heightPx', heightPx);
  const scale = (-2 * Math.PI) / heightPx;
  out.dAzimuth = scale * dxPx;
  out.dPolar = scale * dyPx;
  return out;
}

/**
 * The first event always locks a mode. Only a notch-sized integer `deltaY`
 * (or a line/page `deltaMode`) means a mouse wheel; every smaller or
 * fractional delta starts a trackpad gesture, so a ramp like 1, 2, 4 … 64
 * never switches to zoom halfway through.
 */
function startingMode(sample: WheelSample): 'mouse' | 'trackpad' {
  if (sample.deltaMode !== 0) {
    return 'mouse';
  }

  const notchSized =
    Number.isInteger(sample.deltaY) &&
    sample.deltaX === 0 &&
    Math.abs(sample.deltaY) >= CAMERA_CONFIG.wheelNotchMinDeltaPx;
  return notchSized ? 'mouse' : 'trackpad';
}

function clampSteps(steps: number): number {
  if (steps > MAX_WHEEL_STEPS) {
    return MAX_WHEEL_STEPS;
  }
  if (steps < -MAX_WHEEL_STEPS) {
    return -MAX_WHEEL_STEPS;
  }
  return steps;
}
