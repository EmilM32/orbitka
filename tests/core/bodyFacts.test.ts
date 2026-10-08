import { describe, expect, it, test } from 'vitest';

import {
  computeBodyFacts,
  DAY_IN_HOURS_BELOW,
  diameterGauge,
  EARTH_RADIUS_KM,
  roundKm,
  roundRatio,
  splitHours,
  YEAR_IN_DAYS_BELOW,
  type FactsBody,
} from '@core/bodyFacts.ts';
import { getBody } from '@data/bodies.ts';

const earth = getBody('earth');

function planet(overrides: Partial<FactsBody> = {}): FactsBody {
  return {
    type: 'planet',
    radiusKm: 69911,
    rotation: { periodHours: 9.925 },
    orbit: { periodDays: 4332.82 },
    ...overrides,
  };
}

describe('bodyFacts', () => {
  test('constants', () => {
    expect(EARTH_RADIUS_KM).toBe(earth.radiusKm);
    expect(YEAR_IN_DAYS_BELOW).toBe(1);
    expect(DAY_IN_HOURS_BELOW).toBe(48);
  });

  test.each([
    ['jupiter', 10.973, 11.862, 9.925],
    ['saturn', 9.14, 29.447, 10.656],
    ['mercury', 0.383, 0.241, 1407.6],
    ['earth', 1, 1, 23.9345],
    ['moon', 0.273, null, 655.72],
    ['sun', 109.198, null, 609.12],
  ] as const)('golden values › %s', (id, diameter, year, day) => {
    const facts = computeBodyFacts(getBody(id), earth);

    expect(facts.diameterVsEarth).toBeCloseTo(diameter, 3);
    if (year === null) {
      expect(facts.yearEarthYears).toBeNull();
    } else {
      expect(facts.yearEarthYears).toBeCloseTo(year, 3);
    }
    expect(facts.dayHours).toBeCloseTo(day, 3);
  });

  test('diameterGauge', () => {
    const jupiter = diameterGauge(69911 / EARTH_RADIUS_KM);
    expect(jupiter.bodyFraction).toBe(1);
    expect(jupiter.earthFraction).toBeCloseTo(0.0911, 3);

    const mercury = diameterGauge(2439.7 / EARTH_RADIUS_KM);
    expect(mercury.bodyFraction).toBeCloseTo(0.383, 3);
    expect(mercury.earthFraction).toBe(1);

    expect(diameterGauge(1)).toEqual({ bodyFraction: 1, earthFraction: 1 });
  });

  test.each([
    [10.973, { value: 11, approximate: true, inverse: null }],
    [9.14, { value: 9.1, approximate: false, inverse: null }],
    [0.383, { value: 0.38, approximate: false, inverse: 2.6 }],
    [1737.4 / 6371, { value: 0.27, approximate: false, inverse: 3.7 }],
    [695700 / 6371, { value: 109, approximate: true, inverse: null }],
  ])('roundRatio › %d', (k, expected) => {
    expect(roundRatio(k)).toEqual(expected);
  });

  test.each([
    [139822, 139800],
    [116464, 116500],
    [4879.4, 4900],
    [12742, 12700],
    [0, 0],
  ])('roundKm › %d', (km, expected) => {
    expect(roundKm(km)).toBe(expected);
  });

  test.each([
    [9.925, { hours: 9, minutes: 56 }],
    [10.656, { hours: 10, minutes: 39 }],
    [23.9345, { hours: 23, minutes: 56 }],
    [9.999, { hours: 10, minutes: 0 }],
  ])('splitHours › %d', (hours, expected) => {
    expect(splitHours(hours)).toEqual(expected);
  });

  describe('rejects invalid input', () => {
    const fn = 'computeBodyFacts';

    it.each([
      [
        'body.radiusKm 0',
        () => computeBodyFacts(planet({ radiusKm: 0 }), earth),
        `${fn}: parameter "body.radiusKm" must be a finite number > 0, got 0`,
      ],
      [
        'body.radiusKm NaN',
        () => computeBodyFacts(planet({ radiusKm: Number.NaN }), earth),
        `${fn}: parameter "body.radiusKm" must be a finite number > 0, got NaN`,
      ],
      [
        'body.radiusKm Infinity',
        () => computeBodyFacts(planet({ radiusKm: Infinity }), earth),
        `${fn}: parameter "body.radiusKm" must be a finite number > 0, got Infinity`,
      ],
      [
        'earth.radiusKm -1',
        () => computeBodyFacts(planet(), { ...earth, radiusKm: -1 }),
        `${fn}: parameter "earth.radiusKm" must be a finite number > 0, got -1`,
      ],
      [
        'rotation.periodHours negative',
        () =>
          computeBodyFacts(
            planet({ rotation: { periodHours: -5832.6 } }),
            earth,
          ),
        `${fn}: parameter "body.rotation.periodHours" must be a finite number > 0, got -5832.6`,
      ],
      [
        'rotation.periodHours not a number',
        () =>
          computeBodyFacts(
            planet({
              rotation: { periodHours: '10' as unknown as number },
            }),
            earth,
          ),
        `${fn}: parameter "body.rotation.periodHours" must be a finite number > 0, got 10`,
      ],
      [
        'planet without orbit',
        () => computeBodyFacts(planet({ orbit: undefined }), earth),
        `${fn}: parameter "body.orbit" must be present for type planet, got undefined`,
      ],
      [
        'earth without orbit',
        () => computeBodyFacts(planet(), { ...earth, orbit: undefined }),
        `${fn}: parameter "earth.orbit.periodDays" must be a finite number > 0, got undefined`,
      ],
      [
        'earth.orbit.periodDays 0',
        () =>
          computeBodyFacts(planet(), { ...earth, orbit: { periodDays: 0 } }),
        `${fn}: parameter "earth.orbit.periodDays" must be a finite number > 0, got 0`,
      ],
      [
        'diameterGauge k 0',
        () => diameterGauge(0),
        'diameterGauge: parameter "k" must be a finite number > 0, got 0',
      ],
      [
        'diameterGauge k NaN',
        () => diameterGauge(Number.NaN),
        'diameterGauge: parameter "k" must be a finite number > 0, got NaN',
      ],
      [
        'roundRatio k -2',
        () => roundRatio(-2),
        'roundRatio: parameter "k" must be a finite number > 0, got -2',
      ],
      [
        'roundRatio k Infinity',
        () => roundRatio(Infinity),
        'roundRatio: parameter "k" must be a finite number > 0, got Infinity',
      ],
      [
        'roundKm -1',
        () => roundKm(-1),
        'roundKm: parameter "km" must be a finite number >= 0, got -1',
      ],
      [
        'roundKm NaN',
        () => roundKm(Number.NaN),
        'roundKm: parameter "km" must be a finite number >= 0, got NaN',
      ],
      [
        'roundKm Infinity',
        () => roundKm(Infinity),
        'roundKm: parameter "km" must be a finite number >= 0, got Infinity',
      ],
      [
        'splitHours 0',
        () => splitHours(0),
        'splitHours: parameter "hours" must be a finite number > 0, got 0',
      ],
      [
        'splitHours NaN',
        () => splitHours(Number.NaN),
        'splitHours: parameter "hours" must be a finite number > 0, got NaN',
      ],
      [
        'splitHours Infinity',
        () => splitHours(Infinity),
        'splitHours: parameter "hours" must be a finite number > 0, got Infinity',
      ],
    ])('%s', (_name, call, message) => {
      expect(call).toThrow(RangeError);
      expect(call).toThrow(message);
    });

    it.each([
      ['star', getBody('sun')],
      ['moon', getBody('moon')],
    ])('type %s has no year and does not throw', (_type, body) => {
      expect(computeBodyFacts(body, earth).yearEarthYears).toBeNull();
    });
  });

  test('gauge fractions are in (0,1] and max is 1', () => {
    // mulberry32 with a fixed seed, so the run is repeatable.
    let seed = 0x5eed;
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (let index = 0; index < 200; index += 1) {
      const k = 0.01 + random() * (200 - 0.01);
      const { bodyFraction, earthFraction } = diameterGauge(k);

      for (const fraction of [bodyFraction, earthFraction]) {
        expect(fraction).toBeGreaterThan(0);
        expect(fraction).toBeLessThanOrEqual(1);
      }
      expect(Math.max(bodyFraction, earthFraction)).toBe(1);
      expect(bodyFraction / earthFraction).toBeCloseTo(k, 9);
    }
  });
});
