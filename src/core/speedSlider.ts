import { SPEED_MAX, SPEED_MIN } from './clock.ts';

export const SLIDER_STEPS = 1000;

function boundsError(
  functionName: string,
  name: 'min' | 'max',
  value: number,
): RangeError {
  const requirement =
    name === 'min' ? 'must be finite and > 0' : 'must be finite and > min';
  return new RangeError(
    `${functionName}: parameter "${name}" ${requirement}, got ${value}`,
  );
}

function assertBounds(functionName: string, min: number, max: number): void {
  if (!Number.isFinite(min) || !(min > 0)) {
    throw boundsError(functionName, 'min', min);
  }

  if (!Number.isFinite(max) || !(max > min)) {
    throw boundsError(functionName, 'max', max);
  }
}

export function sliderToSpeed(
  position: number,
  min = SPEED_MIN,
  max = SPEED_MAX,
): number {
  assertBounds('sliderToSpeed', min, max);

  // min * exp(ln(max / min)) is 3652.4999999999986, not 3652.5.
  // Return the endpoints directly.
  if (Number.isNaN(position) || position <= 0) {
    return min;
  }

  if (position >= SLIDER_STEPS) {
    return max;
  }

  return min * Math.exp(Math.log(max / min) * (position / SLIDER_STEPS));
}

export function speedToSlider(
  speed: number,
  min = SPEED_MIN,
  max = SPEED_MAX,
): number {
  assertBounds('speedToSlider', min, max);

  if (Number.isNaN(speed)) {
    throw new RangeError(
      `speedToSlider: parameter "speed" must be finite, got ${speed}`,
    );
  }

  if (speed <= min) {
    return 0;
  }

  if (speed >= max) {
    return SLIDER_STEPS;
  }

  return Math.round(
    (SLIDER_STEPS * Math.log(speed / min)) / Math.log(max / min),
  );
}
