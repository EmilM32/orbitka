// Radial profile of a planetary ring (EMI-221). Pure math: render turns the
// samples into a 1-pixel-high texture across the ring's width.

export type RingBand = {
  fromKm: number;
  toKm: number;
  alpha: number;
  brightness: number;
};

// Band edges from the NASA Saturnian Rings Fact Sheet. Alpha and brightness
// are chosen for appearance.
export const SATURN_RING_BANDS: readonly RingBand[] = [
  { fromKm: 74_500, toKm: 92_000, alpha: 0.25, brightness: 0.55 }, // C ring
  { fromKm: 92_000, toKm: 117_580, alpha: 0.9, brightness: 1.0 }, // B ring
  { fromKm: 117_580, toKm: 122_170, alpha: 0.05, brightness: 0.3 }, // Cassini Division
  { fromKm: 122_170, toKm: 136_780, alpha: 0.65, brightness: 0.85 }, // A ring
];

function invalidInput(
  parameter: string,
  requirement: string,
  value: unknown,
): RangeError {
  return new RangeError(
    `sampleRingProfile: parameter "${parameter}" ${requirement}, got ${String(value)}`,
  );
}

function isUnit(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function requireBands(bands: readonly RingBand[]): void {
  let previousToKm = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    if (band === undefined) {
      continue;
    }
    if (
      !Number.isFinite(band.fromKm) ||
      !Number.isFinite(band.toKm) ||
      band.toKm <= band.fromKm
    ) {
      throw invalidInput(
        'bands',
        'must have finite fromKm < toKm',
        `[${band.fromKm}, ${band.toKm}) at index ${index}`,
      );
    }
    if (!isUnit(band.alpha) || !isUnit(band.brightness)) {
      throw invalidInput(
        'bands',
        'must have alpha and brightness in [0, 1]',
        `alpha ${band.alpha}, brightness ${band.brightness} at index ${index}`,
      );
    }
    if (band.fromKm < previousToKm) {
      throw invalidInput(
        'bands',
        'must be sorted and non-overlapping',
        `fromKm ${band.fromKm} before the previous toKm ${previousToKm} at index ${index}`,
      );
    }
    previousToKm = band.toKm;
  }
}

/**
 * RGBA in [0, 1], `samples · 4` long. Sample i sits at the center of texel i:
 * r = innerKm + (i + 0.5) / samples · (outerKm − innerKm). RGB is the band's
 * brightness (the material color tints it), A its alpha. A sample outside
 * every band is fully transparent.
 */
export function sampleRingProfile(
  bands: readonly RingBand[],
  innerKm: number,
  outerKm: number,
  samples: number,
): Float32Array {
  if (!Number.isInteger(samples) || samples < 2) {
    throw invalidInput('samples', 'must be an integer >= 2', samples);
  }
  if (!Number.isFinite(innerKm) || innerKm < 0) {
    throw invalidInput('innerKm', 'must be finite and >= 0', innerKm);
  }
  if (!Number.isFinite(outerKm) || outerKm <= innerKm) {
    throw invalidInput(
      'outerKm',
      `must be finite and > innerKm (${innerKm})`,
      outerKm,
    );
  }
  requireBands(bands);

  const out = new Float32Array(samples * 4);
  const width = outerKm - innerKm;
  let bandIndex = 0;
  for (let index = 0; index < samples; index += 1) {
    const radiusKm = innerKm + ((index + 0.5) / samples) * width;
    // Samples grow with the index and the bands are sorted, so one pass.
    while (
      bandIndex < bands.length &&
      (bands[bandIndex]?.toKm ?? Number.POSITIVE_INFINITY) <= radiusKm
    ) {
      bandIndex += 1;
    }
    const band = bands[bandIndex];
    const offset = index * 4;
    if (band === undefined || radiusKm < band.fromKm) {
      continue;
    }
    out[offset] = band.brightness;
    out[offset + 1] = band.brightness;
    out[offset + 2] = band.brightness;
    out[offset + 3] = band.alpha;
  }

  return out;
}
