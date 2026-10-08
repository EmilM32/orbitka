/** A zoom button counts as at its limit within 1 % of the distance. */
export const ZOOM_LIMIT_EPSILON = 0.01;

export type ZoomLimitState = { atMin: boolean; atMax: boolean };

function requirePositive(parameter: 'min' | 'max', value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(
      `zoomLimitState: parameter "${parameter}" must be a positive finite number${parameter === 'min' ? ' not greater than max' : ''}, got ${value}`,
    );
  }
}

/**
 * `atMin`: the camera is as close as it may get (zoom in is disabled).
 * `atMax`: as far as it may get (zoom out is disabled). Pass `out` to reuse
 * one object per frame.
 */
export function zoomLimitState(
  distance: number,
  min: number,
  max: number,
  out: ZoomLimitState = { atMin: false, atMax: false },
): ZoomLimitState {
  requirePositive('min', min);
  requirePositive('max', max);
  if (min > max) {
    throw new RangeError(
      `zoomLimitState: parameter "min" must be a positive finite number not greater than max, got ${min}`,
    );
  }
  if (!Number.isFinite(distance)) {
    throw new RangeError(
      `zoomLimitState: parameter "distance" must be a finite number, got ${distance}`,
    );
  }

  out.atMin = distance <= min * (1 + ZOOM_LIMIT_EPSILON);
  out.atMax = distance >= max * (1 - ZOOM_LIMIT_EPSILON);
  return out;
}
