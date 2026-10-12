import { SPEED_MAX, SPEED_MIN, SPEED_PRESETS } from './clock.ts';

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

export type PresetTick = {
  id: string;
  /** Slider position, 0 to `SLIDER_STEPS`, from the same mapping as the thumb. */
  position: number;
};

/** The speed presets as marks on the slider. "Pause" has no speed, so no mark. */
export function presetTicks(): readonly PresetTick[] {
  return SPEED_PRESETS.filter((preset) => preset.daysPerSecond > 0).map(
    (preset) => ({
      id: preset.id,
      position: speedToSlider(preset.daysPerSecond),
    }),
  );
}

/** Slider steps that span `radiusPx` on a track `trackPx` wide. */
export function stepsForPixels(radiusPx: number, trackPx: number): number {
  if (!Number.isFinite(radiusPx) || radiusPx < 0) {
    throw new RangeError(
      `stepsForPixels: parameter "radiusPx" must be finite and >= 0, got ${radiusPx}`,
    );
  }

  if (!Number.isFinite(trackPx) || !(trackPx > 0)) {
    throw new RangeError(
      `stepsForPixels: parameter "trackPx" must be finite and > 0, got ${trackPx}`,
    );
  }

  return (radiusPx / trackPx) * SLIDER_STEPS;
}

/** The nearest preset mark within `radiusSteps` of `position`, else null. */
export function nearestPresetTick(
  position: number,
  radiusSteps: number,
): PresetTick | null {
  let nearest: PresetTick | null = null;
  let nearestDistance = Infinity;
  for (const tick of presetTicks()) {
    const distance = Math.abs(tick.position - position);
    if (distance <= radiusSteps && distance < nearestDistance) {
      nearest = tick;
      nearestDistance = distance;
    }
  }

  return nearest;
}
