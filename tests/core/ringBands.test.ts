import { expect, test } from 'vitest';

import {
  SATURN_RING_BANDS,
  sampleRingProfile,
  type RingBand,
} from '@core/ringBands.ts';

const INNER_KM = 74_500;
const OUTER_KM = 136_780;
const SAMPLES = 512;

// Index of the texel whose center lies nearest to radiusKm.
function sampleAt(radiusKm: number, samples = SAMPLES): number {
  return Math.round(
    ((radiusKm - INNER_KM) / (OUTER_KM - INNER_KM)) * samples - 0.5,
  );
}

function channel(profile: Float32Array, index: number, offset: number): number {
  const value = profile[index * 4 + offset];
  if (value === undefined) {
    throw new Error(`missing sample ${index}`);
  }
  return value;
}

test('ringBands › samples bands', () => {
  const profile = sampleRingProfile(
    SATURN_RING_BANDS,
    INNER_KM,
    OUTER_KM,
    SAMPLES,
  );
  expect(profile).toHaveLength(SAMPLES * 4);

  const middleOfB = sampleAt((92_000 + 117_580) / 2);
  expect(channel(profile, middleOfB, 3)).toBeCloseTo(0.9, 6);
  expect(channel(profile, middleOfB, 0)).toBeCloseTo(1, 6);

  const middleOfC = sampleAt((74_500 + 92_000) / 2);
  expect(channel(profile, middleOfC, 3)).toBeCloseTo(0.25, 6);
  expect(channel(profile, middleOfC, 1)).toBeCloseTo(0.55, 6);

  const middleOfA = sampleAt((122_170 + 136_780) / 2);
  expect(channel(profile, middleOfA, 3)).toBeCloseTo(0.65, 6);
  expect(channel(profile, middleOfA, 2)).toBeCloseTo(0.85, 6);

  // The first and last texels sit inside C and A.
  expect(channel(profile, 0, 3)).toBeCloseTo(0.25, 6);
  expect(channel(profile, SAMPLES - 1, 3)).toBeCloseTo(0.65, 6);
});

test('ringBands › cassini gap is dark', () => {
  const profile = sampleRingProfile(
    SATURN_RING_BANDS,
    INNER_KM,
    OUTER_KM,
    SAMPLES,
  );
  const gap = sampleAt(119_875);
  expect(channel(profile, gap, 3)).toBeCloseTo(0.05, 6);
  expect(channel(profile, gap, 0)).toBeCloseTo(0.3, 6);
  expect(channel(profile, gap, 3)).toBeLessThan(
    channel(profile, sampleAt(110_000), 3),
  );
});

test('ringBands › a sample outside every band is transparent', () => {
  const bands: RingBand[] = [
    { fromKm: 10, toKm: 20, alpha: 1, brightness: 1 },
    { fromKm: 30, toKm: 40, alpha: 0.5, brightness: 0.5 },
  ];
  // Texel centers 2.5, 7.5, …, 47.5 over [0, 50].
  const profile = sampleRingProfile(bands, 0, 50, 10);
  const alphas = Array.from({ length: 10 }, (_, index) =>
    channel(profile, index, 3),
  );
  expect(alphas).toEqual([0, 0, 1, 1, 0, 0, 0.5, 0.5, 0, 0]);
  expect(channel(profile, 4, 0)).toBe(0);
});

test.each([2, 7, 512, 1000])(
  'ringBands › all channels stay in [0,1] (samples %i)',
  (samples) => {
    const profile = sampleRingProfile(
      SATURN_RING_BANDS,
      INNER_KM,
      OUTER_KM,
      samples,
    );
    expect(profile).toHaveLength(samples * 4);
    for (const value of profile) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  },
);

test.each([
  [
    'samples < 2',
    () => sampleRingProfile(SATURN_RING_BANDS, INNER_KM, OUTER_KM, 1),
    'sampleRingProfile: parameter "samples" must be an integer >= 2, got 1',
  ],
  [
    'samples not an integer',
    () => sampleRingProfile(SATURN_RING_BANDS, INNER_KM, OUTER_KM, 2.5),
    'sampleRingProfile: parameter "samples" must be an integer >= 2, got 2.5',
  ],
  [
    'samples NaN',
    () => sampleRingProfile(SATURN_RING_BANDS, INNER_KM, OUTER_KM, Number.NaN),
    'sampleRingProfile: parameter "samples" must be an integer >= 2, got NaN',
  ],
  [
    'outerKm equal to innerKm',
    () => sampleRingProfile(SATURN_RING_BANDS, INNER_KM, INNER_KM, 8),
    'sampleRingProfile: parameter "outerKm" must be finite and > innerKm (74500), got 74500',
  ],
  [
    'outerKm below innerKm',
    () => sampleRingProfile(SATURN_RING_BANDS, INNER_KM, 1000, 8),
    'parameter "outerKm"',
  ],
  [
    'outerKm Infinity',
    () =>
      sampleRingProfile(
        SATURN_RING_BANDS,
        INNER_KM,
        Number.POSITIVE_INFINITY,
        8,
      ),
    'parameter "outerKm"',
  ],
  [
    'innerKm NaN',
    () => sampleRingProfile(SATURN_RING_BANDS, Number.NaN, OUTER_KM, 8),
    'parameter "innerKm"',
  ],
  [
    'overlapping bands',
    () =>
      sampleRingProfile(
        [
          { fromKm: 0, toKm: 20, alpha: 1, brightness: 1 },
          { fromKm: 10, toKm: 30, alpha: 1, brightness: 1 },
        ],
        0,
        30,
        8,
      ),
    'sampleRingProfile: parameter "bands" must be sorted and non-overlapping',
  ],
  [
    'unsorted bands',
    () =>
      sampleRingProfile(
        [
          { fromKm: 20, toKm: 30, alpha: 1, brightness: 1 },
          { fromKm: 0, toKm: 10, alpha: 1, brightness: 1 },
        ],
        0,
        30,
        8,
      ),
    'parameter "bands" must be sorted and non-overlapping',
  ],
  [
    'empty band',
    () =>
      sampleRingProfile(
        [{ fromKm: 10, toKm: 10, alpha: 1, brightness: 1 }],
        0,
        30,
        8,
      ),
    'parameter "bands" must have finite fromKm < toKm',
  ],
  [
    'alpha above 1',
    () =>
      sampleRingProfile(
        [{ fromKm: 0, toKm: 10, alpha: 1.5, brightness: 1 }],
        0,
        30,
        8,
      ),
    'parameter "bands" must have alpha and brightness in [0, 1]',
  ],
])('ringBands › rejects invalid input: %s', (_name, call, message) => {
  expect(call).toThrow(RangeError);
  expect(call).toThrow(message);
});
