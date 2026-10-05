import { expect, test } from 'vitest';

import { getBody } from '@data/bodies.ts';
import {
  compressMoonOffsetKm,
  compressPositionAu,
  distanceToScene,
  moonDistanceToScene,
  moonRadiiToScene,
  moonRadiusToScene,
  radiusToScene,
  SCALE,
  type Vec3,
} from '@sim/scale.ts';

const MERCURY = { semiMajorAxisAu: 0.38709927, eccentricity: 0.20563593 };
const SUN_RADIUS_KM = 695700;
const EARTH_RADIUS_KM = 6371;
const JUPITER_RADIUS_KM = 69911;

function expectNear(actual: number, expected: number, tolerance: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

function grid(from: number, to: number, steps: number): number[] {
  return Array.from(
    { length: steps + 1 },
    (_, index) => from * (to / from) ** (index / steps),
  );
}

test('distance grows strictly from 0.1 to 50 AU', () => {
  const distances = grid(0.1, 50, 200).map(distanceToScene);

  for (let index = 1; index < distances.length; index += 1) {
    expect(distances[index]).toBeGreaterThan(distances[index - 1] ?? Infinity);
  }
});

test('distance is 0 at 0 AU', () => {
  expect(distanceToScene(0)).toBe(0);
});

test('radius never shrinks from 1 to 1e6 km', () => {
  const radii = grid(1, 1e6, 200).map(radiusToScene);

  for (let index = 1; index < radii.length; index += 1) {
    expect(radii[index]).toBeGreaterThanOrEqual(radii[index - 1] ?? Infinity);
  }
});

test('radius stays within its bounds', () => {
  expect(radiusToScene(1)).toBe(SCALE.radiusMin);
  expect(radiusToScene(1e9)).toBe(SCALE.radiusMax);
});

test.each([
  ['Mercury', 0.38709927, 4.98],
  ['Venus', 0.72333566, 6.8],
  ['Earth', 1.00000261, 8.0],
  ['Mars', 1.52371034, 9.88],
  ['Jupiter', 5.202887, 18.25],
  ['Saturn', 9.53667594, 24.71],
  ['Uranus', 19.18916464, 35.04],
  ['Neptune', 30.06992276, 43.87],
])('%s sits at its control distance', (_name, semiMajorAxisAu, expected) => {
  expectNear(distanceToScene(semiMajorAxisAu), expected, 0.01);
});

test.each([
  ['the Sun', SUN_RADIUS_KM, 3.26],
  ['Mercury', 2439.7, 0.34],
  ['the Earth', EARTH_RADIUS_KM, 0.5],
  ['Jupiter', JUPITER_RADIUS_KM, 1.3],
])('%s has its control radius', (_name, km, expected) => {
  expectNear(radiusToScene(km), expected, 0.01);
});

test('the Sun does not cover the orbit of Mercury', () => {
  const perihelion = distanceToScene(
    MERCURY.semiMajorAxisAu * (1 - MERCURY.eccentricity),
  );

  expect(radiusToScene(SUN_RADIUS_KM)).toBeLessThan(perihelion - 1.0);
  expect(SCALE.radiusMax).toBeLessThan(perihelion - 1.0);
});

test.each([
  ['the Moon', 384400, EARTH_RADIUS_KM, 1.0],
  ['Io', 421800, JUPITER_RADIUS_KM, 2.1],
  ['Callisto', 1882700, JUPITER_RADIUS_KM, 2.3],
])(
  '%s sits at its control distance from its planet',
  (_name, distanceKm, parentRadiusKm, expected) => {
    expectNear(moonDistanceToScene(distanceKm, parentRadiusKm), expected, 0.05);
  },
);

test.each([
  ['the Moon', 384400, EARTH_RADIUS_KM],
  ['Io', 421800, JUPITER_RADIUS_KM],
  ['Europa', 671100, JUPITER_RADIUS_KM],
  ['Ganymede', 1070400, JUPITER_RADIUS_KM],
  ['Callisto', 1882700, JUPITER_RADIUS_KM],
])(
  '%s orbits outside 1.5 times the planet radius',
  (_name, distanceKm, parentRadiusKm) => {
    expect(moonDistanceToScene(distanceKm, parentRadiusKm)).toBeGreaterThan(
      radiusToScene(parentRadiusKm) * 1.5,
    );
  },
);

test('moon distance grows with the real distance', () => {
  const distances = grid(1e4, 1e7, 100).map((km) =>
    moonDistanceToScene(km, JUPITER_RADIUS_KM),
  );

  for (let index = 1; index < distances.length; index += 1) {
    expect(distances[index]).toBeGreaterThan(distances[index - 1] ?? Infinity);
  }
});

test('moon distance is 0 at 0 km', () => {
  expect(moonDistanceToScene(0, EARTH_RADIUS_KM)).toBe(0);
});

test('moon radius has its control value and stays within its bounds', () => {
  expectNear(moonRadiusToScene(1737.4), 0.16, 0.01);
  expect(moonRadiusToScene(1)).toBe(SCALE.moonRadiusMin);
  expect(moonRadiusToScene(1e9)).toBe(SCALE.moonRadiusMax);
});

test.each([
  ['distanceToScene', 'au', -1, 'must be >= 0'],
  ['moonDistanceToScene', 'distanceKm', -1, 'must be >= 0'],
  ['radiusToScene', 'km', 0, 'must be > 0'],
  ['radiusToScene', 'km', -5, 'must be > 0'],
  ['moonRadiusToScene', 'km', 0, 'must be > 0'],
  ['moonRadiusToScene', 'km', -1, 'must be > 0'],
] as const)(
  '%s throws RangeError when %s is %s',
  (functionName, parameter, value, requirement) => {
    const call =
      functionName === 'distanceToScene'
        ? () => distanceToScene(value)
        : functionName === 'moonDistanceToScene'
          ? () => moonDistanceToScene(value, EARTH_RADIUS_KM)
          : functionName === 'radiusToScene'
            ? () => radiusToScene(value)
            : () => moonRadiusToScene(value);

    expect(call).toThrow(RangeError);
    expect(call).toThrow(
      `${functionName}: parameter "${parameter}" ${requirement}, got ${value}`,
    );
  },
);

test('radius conversions read the exponent from SCALE', () => {
  const probeKm = 20_000;
  const scale = SCALE as { radiusExponent: number };
  const original = scale.radiusExponent;
  scale.radiusExponent = 0.25;

  try {
    const planet = Math.min(
      SCALE.radiusMax,
      Math.max(SCALE.radiusMin, SCALE.c * probeKm ** scale.radiusExponent),
    );
    const moon = Math.min(
      SCALE.moonRadiusMax,
      Math.max(
        SCALE.moonRadiusMin,
        SCALE.moonRadiusC * probeKm ** scale.radiusExponent,
      ),
    );

    expect(radiusToScene(probeKm)).toBeCloseTo(planet, 12);
    expect(moonRadiusToScene(probeKm)).toBeCloseTo(moon, 12);
    expect(radiusToScene(probeKm)).not.toBeCloseTo(SCALE.c * probeKm ** 0.4, 6);
  } finally {
    scale.radiusExponent = original;
  }
});

test('compressPositionAu maps 1 AU on the x axis to k scene units', () => {
  const out: Vec3 = { x: 9, y: 9, z: 9 };

  expect(compressPositionAu(1, 0, 0, out)).toEqual({ x: 8, y: 0, z: 0 });
});

test('compressPositionAu keeps the direction and compresses the length', () => {
  const out: Vec3 = { x: 0, y: 0, z: 0 };
  const result = compressPositionAu(0, 3, 4, out);
  const length = Math.hypot(result.x, result.y, result.z);

  expect(result).toBe(out);
  expect(length).toBeCloseTo(distanceToScene(5), 12);
  expect(result.x / length).toBeCloseTo(0, 12);
  expect(result.y / length).toBeCloseTo(0.6, 12);
  expect(result.z / length).toBeCloseTo(0.8, 12);
});

test('compressPositionAu maps the origin to the origin', () => {
  const out: Vec3 = { x: 1, y: 2, z: 3 };

  expect(compressPositionAu(0, 0, 0, out)).toBe(out);
  expect(out).toEqual({ x: 0, y: 0, z: 0 });
});

test.each([
  ['distanceToScene', 'au', Number.NaN],
  ['distanceToScene', 'au', Number.POSITIVE_INFINITY],
  ['distanceToScene', 'au', Number.NEGATIVE_INFINITY],
  ['radiusToScene', 'km', Number.NaN],
  ['radiusToScene', 'km', Number.POSITIVE_INFINITY],
  ['moonRadiusToScene', 'km', Number.NaN],
  ['moonRadiusToScene', 'km', Number.POSITIVE_INFINITY],
] as const)(
  '%s throws RangeError for non-finite %s',
  (functionName, parameter, value) => {
    const call =
      functionName === 'distanceToScene'
        ? () => distanceToScene(value)
        : functionName === 'radiusToScene'
          ? () => radiusToScene(value)
          : () => moonRadiusToScene(value);

    expect(call).toThrow(RangeError);
    expect(call).toThrow(
      `${functionName}: parameter "${parameter}" must be finite, got ${value}`,
    );
  },
);

test.each([0, -6371, Number.NaN])(
  'moonDistanceToScene throws when parentRadiusKm is %s',
  (parentRadiusKm) => {
    const call = () => moonDistanceToScene(384400, parentRadiusKm);

    expect(call).toThrow(RangeError);
    expect(call).toThrow(
      `moonDistanceToScene: parameter "parentRadiusKm" must be finite and > 0, got ${parentRadiusKm}`,
    );
  },
);

test('moonDistanceToScene throws for a non-finite distance', () => {
  const call = () => moonDistanceToScene(Number.NaN, EARTH_RADIUS_KM);

  expect(call).toThrow(RangeError);
  expect(call).toThrow(
    'moonDistanceToScene: parameter "distanceKm" must be finite, got NaN',
  );
  expect(() =>
    moonDistanceToScene(Number.POSITIVE_INFINITY, EARTH_RADIUS_KM),
  ).toThrow(
    'moonDistanceToScene: parameter "distanceKm" must be finite, got Infinity',
  );
});

test.each([
  [Number.NaN, 0, 0, 'x'],
  [Number.POSITIVE_INFINITY, 0, 0, 'x'],
  [0, Number.NaN, 0, 'y'],
  [0, 0, 1e200, 'z'],
] as const)(
  'compressPositionAu throws for a non-finite or overflowing component (%s, %s, %s)',
  (x, y, z, parameter) => {
    const value = parameter === 'x' ? x : parameter === 'y' ? y : z;
    const call = () => compressPositionAu(x, y, z, { x: 0, y: 0, z: 0 });

    expect(call).toThrow(RangeError);
    expect(call).toThrow(
      `compressPositionAu: parameter "${parameter}" must be finite and must not overflow, got ${value}`,
    );
  },
);

test('compressPositionAu keeps a tiny direction that x*x would flush to zero', () => {
  const out: Vec3 = { x: 1, y: 1, z: 1 };
  const result = compressPositionAu(1e-200, 0, 0, out);

  expect(result).toBe(out);
  expect(result.x).not.toBe(0);
  expect(result.y).toBe(0);
  expect(result.z).toBe(0);
  expect(result.x / distanceToScene(1e-200)).toBeCloseTo(1, 6);
});

test('compressPositionAu compresses a long finite vector without squaring it', () => {
  const out: Vec3 = { x: 0, y: 0, z: 0 };

  compressPositionAu(0, 1e150, 0, out);

  expect(out.x).toBe(0);
  expect(out.z).toBe(0);
  expect(Number.isFinite(out.y)).toBe(true);
  expect(out.y / distanceToScene(1e150)).toBeCloseTo(1, 6);
});

function freshOut(): Vec3 {
  return { x: 7, y: 8, z: 9 };
}

test('compressMoonOffsetKm › values', () => {
  const alongX = freshOut();
  expect(compressMoonOffsetKm(400080.2, 0, 0, EARTH_RADIUS_KM, alongX)).toBe(
    alongX,
  );
  expectNear(alongX.x, 1.019, 0.005);
  expect(alongX.y).toBe(0);
  expect(alongX.z).toBe(0);

  const scale = 10_000;
  const diagonal = freshOut();
  compressMoonOffsetKm(scale, 2 * scale, 3 * scale, EARTH_RADIUS_KM, diagonal);
  expect(diagonal.y).toBeCloseTo(diagonal.x * 2, 8);
  expect(diagonal.z).toBeCloseTo(diagonal.x * 3, 8);
  expectNear(
    Math.hypot(diagonal.x, diagonal.y, diagonal.z),
    moonDistanceToScene(
      Math.hypot(scale, 2 * scale, 3 * scale),
      EARTH_RADIUS_KM,
    ),
    1e-9,
  );

  const origin = freshOut();
  compressMoonOffsetKm(0, 0, 0, EARTH_RADIUS_KM, origin);
  expect(origin).toEqual({ x: 0, y: 0, z: 0 });
});

test.each([
  ['x', Number.NaN, 0, 0],
  ['x', Number.POSITIVE_INFINITY, 0, 0],
  ['x', Number.NEGATIVE_INFINITY, 0, 0],
  ['y', 0, Number.NaN, 0],
  ['y', 0, Number.POSITIVE_INFINITY, 0],
  ['y', 0, Number.NEGATIVE_INFINITY, 0],
  ['z', 0, 0, Number.NaN],
  ['z', 0, 0, Number.POSITIVE_INFINITY],
  ['z', 0, 0, Number.NEGATIVE_INFINITY],
] as const)(
  'compressMoonOffsetKm › RangeError component %s = %s',
  (parameter, x, y, z) => {
    const value = parameter === 'x' ? x : parameter === 'y' ? y : z;
    const out = freshOut();
    const call = () => compressMoonOffsetKm(x, y, z, EARTH_RADIUS_KM, out);

    expect(call).toThrow(RangeError);
    expect(call).toThrow(
      `compressMoonOffsetKm: parameter "${parameter}" must be finite, got ${value}`,
    );
    expect(out).toEqual(freshOut());
  },
);

test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY] as const)(
  'compressMoonOffsetKm › RangeError parentRadiusKm = %s',
  (parentRadiusKm) => {
    const out = freshOut();
    const call = () => compressMoonOffsetKm(1, 0, 0, parentRadiusKm, out);

    expect(call).toThrow(RangeError);
    expect(call).toThrow(
      `compressMoonOffsetKm: parameter "parentRadiusKm" must be finite and > 0, got ${parentRadiusKm}`,
    );
    expect(out).toEqual(freshOut());
  },
);

test('compressMoonOffsetKm keeps a huge offset finite', () => {
  const out: Vec3 = { x: Number.NaN, y: Number.NaN, z: Number.NaN };
  const result = compressMoonOffsetKm(1e200, 1e200, 0, EARTH_RADIUS_KM, out);

  expect(result).toBe(out);
  expect(Number.isFinite(out.x)).toBe(true);
  expect(Number.isFinite(out.y)).toBe(true);
  expect(Number.isFinite(out.z)).toBe(true);
  expect(out.z).toBe(0);
});

test.each([
  ['Moon', -292453.9, -270671.9, 35659.9, EARTH_RADIUS_KM, 1.019],
  ['Io', 395537.3, 142215.9, 0, JUPITER_RADIUS_KM, 2.087],
  ['Europa', -550633.1, -373314.6, 2914.7, JUPITER_RADIUS_KM, 2.139],
  ['Ganymede', -800606.6, -709163.7, 1089.4, JUPITER_RADIUS_KM, 2.213],
  ['Callisto', 291128, 1859528.5, 7323.6, JUPITER_RADIUS_KM, 2.341],
] as const)(
  'compressMoonOffsetKm › control vectors › %s',
  (_name, x, y, z, parentRadiusKm, expected) => {
    const out: Vec3 = { x: 0, y: 0, z: 0 };
    compressMoonOffsetKm(x, y, z, parentRadiusKm, out);
    expectNear(Math.hypot(out.x, out.y, out.z), expected, 0.005);
  },
);

type MoonSample = {
  axisKm: number;
  eccentricity: number;
  radiusKm: number;
};

function jupiterMoons(): MoonSample[] {
  return ['io', 'europa', 'ganymede', 'callisto'].map((id) => {
    const body = getBody(id);
    if (body.type !== 'moon' || body.orbit === undefined) {
      throw new Error(`missing moon orbit: ${id}`);
    }
    const orbit = body.orbit;
    return {
      axisKm: orbit.semiMajorAxisKm,
      eccentricity: orbit.eccentricity,
      radiusKm: body.radiusKm,
    };
  });
}

function sceneEnds(moon: MoonSample, parentRadiusKm: number) {
  return {
    peri: moonDistanceToScene(
      moon.axisKm * (1 - moon.eccentricity),
      parentRadiusKm,
    ),
    apo: moonDistanceToScene(
      moon.axisKm * (1 + moon.eccentricity),
      parentRadiusKm,
    ),
  };
}

function gapOf(
  moons: readonly MoonSample[],
  index: number,
  parentRadiusKm: number,
): number {
  const order = moons
    .map((moon, moonIndex) => ({ moonIndex, axisKm: moon.axisKm }))
    .sort((left, right) => left.axisKm - right.axisKm);
  const place = order.findIndex((item) => item.moonIndex === index);
  const current = sceneEnds(moons[index] as MoonSample, parentRadiusKm);
  const outerIndex = order[place + 1]?.moonIndex;
  const innerIndex = order[place - 1]?.moonIndex;
  const candidates: number[] = [];

  if (outerIndex !== undefined) {
    candidates.push(
      sceneEnds(moons[outerIndex] as MoonSample, parentRadiusKm).peri -
        current.apo,
    );
  }
  if (innerIndex !== undefined) {
    candidates.push(
      current.peri -
        sceneEnds(moons[innerIndex] as MoonSample, parentRadiusKm).apo,
    );
  } else {
    candidates.push(current.peri - radiusToScene(parentRadiusKm));
  }

  return Math.min(...candidates);
}

test('moonRadiiToScene › gap rule', () => {
  const parentRadiusKm = getBody('jupiter').radiusKm;
  const moons = jupiterMoons();
  const radii = moonRadiiToScene(
    moons.map((moon) => moon.axisKm),
    moons.map((moon) => moon.eccentricity),
    moons.map((moon) => moon.radiusKm),
    parentRadiusKm,
  );
  const parentSceneRadius = radiusToScene(parentRadiusKm);

  for (let index = 0; index < moons.length; index += 1) {
    const moon = moons[index];
    const radius = radii[index];
    if (moon === undefined || radius === undefined) {
      throw new Error(`missing moon ${index}`);
    }
    const ends = sceneEnds(moon, parentRadiusKm);
    const gap = gapOf(moons, index, parentRadiusKm);

    expect(radius).toBeLessThanOrEqual(SCALE.moonGapFraction * gap + 1e-12);
    expect(radius).toBeLessThanOrEqual(moonRadiusToScene(moon.radiusKm));
    expect(radius).toBeLessThan(ends.peri - parentSceneRadius);
    expect(radius).toBeGreaterThan(0);
  }

  const order = moons
    .map((moon, index) => ({ index, axisKm: moon.axisKm }))
    .sort((left, right) => left.axisKm - right.axisKm);
  for (let place = 0; place < order.length - 1; place += 1) {
    const inner = order[place];
    const outer = order[place + 1];
    if (inner === undefined || outer === undefined) {
      throw new Error('missing neighbor');
    }
    const innerMoon = moons[inner.index];
    const outerMoon = moons[outer.index];
    const innerRadius = radii[inner.index];
    const outerRadius = radii[outer.index];
    if (
      innerMoon === undefined ||
      outerMoon === undefined ||
      innerRadius === undefined ||
      outerRadius === undefined
    ) {
      throw new Error('missing neighbor moon');
    }
    const gap =
      sceneEnds(outerMoon, parentRadiusKm).peri -
      sceneEnds(innerMoon, parentRadiusKm).apo;
    expect(innerRadius + outerRadius).toBeLessThanOrEqual(gap + 1e-12);
  }
});

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function separatedMoons(next: () => number, count: number): MoonSample[] {
  const moons: MoonSample[] = [];
  let axisKm = 400_000;
  for (let index = 0; index < count; index += 1) {
    axisKm *= 2.5;
    moons.push({
      axisKm,
      eccentricity: next() * 0.3,
      radiusKm: 200 + next() * 2_000,
    });
  }
  return moons;
}

function shuffleMoons(
  moons: readonly MoonSample[],
  next: () => number,
): MoonSample[] {
  const copy = [...moons];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    const current = copy[index];
    const other = copy[swap];
    if (current === undefined || other === undefined) {
      continue;
    }
    copy[index] = other;
    copy[swap] = current;
  }
  return copy;
}

test('moonRadiiToScene › property', () => {
  const next = mulberry32(113);
  const parentRadiusKm = EARTH_RADIUS_KM;

  for (let trial = 0; trial < 20; trial += 1) {
    const count = 2 + Math.floor(next() * 5);
    const moons = separatedMoons(next, count);
    const radii = moonRadiiToScene(
      moons.map((moon) => moon.axisKm),
      moons.map((moon) => moon.eccentricity),
      moons.map((moon) => moon.radiusKm),
      parentRadiusKm,
    );
    const shuffled = shuffleMoons(moons, next);
    const shuffledRadii = moonRadiiToScene(
      shuffled.map((moon) => moon.axisKm),
      shuffled.map((moon) => moon.eccentricity),
      shuffled.map((moon) => moon.radiusKm),
      parentRadiusKm,
    );

    for (let index = 0; index < moons.length; index += 1) {
      const moon = moons[index];
      const radius = radii[index];
      if (moon === undefined || radius === undefined) {
        throw new Error(`missing sample ${index}`);
      }
      const shuffledIndex = shuffled.findIndex(
        (item) => item.axisKm === moon.axisKm,
      );
      expect(radius).toBeGreaterThan(0);
      expect(shuffledRadii[shuffledIndex]).toBeCloseTo(radius, 12);
      expect(radius).toBeLessThan(
        sceneEnds(moon, parentRadiusKm).peri - radiusToScene(parentRadiusKm),
      );
    }

    const order = [...moons].sort((left, right) => left.axisKm - right.axisKm);
    for (let place = 0; place < order.length - 1; place += 1) {
      const inner = order[place];
      const outer = order[place + 1];
      if (inner === undefined || outer === undefined) {
        throw new Error('missing sample neighbor');
      }
      const innerIndex = moons.findIndex(
        (item) => item.axisKm === inner.axisKm,
      );
      const outerIndex = moons.findIndex(
        (item) => item.axisKm === outer.axisKm,
      );
      const innerRadius = radii[innerIndex];
      const outerRadius = radii[outerIndex];
      if (innerRadius === undefined || outerRadius === undefined) {
        throw new Error('missing sample radius');
      }
      const gap =
        sceneEnds(outer, parentRadiusKm).peri -
        sceneEnds(inner, parentRadiusKm).apo;
      expect(innerRadius + outerRadius).toBeLessThanOrEqual(gap + 1e-9);
    }
  }

  expect(() =>
    moonRadiiToScene(
      [100_000, 110_000],
      [0.2, 0.2],
      [1_000, 1_000],
      parentRadiusKm,
    ),
  ).toThrow(RangeError);
});

test('moonRadiiToScene › edges and errors', () => {
  const moon = getBody('moon');
  if (moon.type !== 'moon' || moon.orbit === undefined) {
    throw new Error('missing Moon orbit');
  }
  const orbit = moon.orbit;

  expect(
    moonRadiiToScene(
      [orbit.semiMajorAxisKm],
      [orbit.eccentricity],
      [moon.radiusKm],
      EARTH_RADIUS_KM,
    ),
  ).toEqual([moonRadiusToScene(moon.radiusKm)]);
  expect(moonRadiiToScene([], [], [], Number.NaN)).toEqual([]);

  const unsorted = jupiterMoons().reverse();
  const sorted = [...unsorted].sort(
    (left, right) => left.axisKm - right.axisKm,
  );
  const unsortedRadii = moonRadiiToScene(
    unsorted.map((item) => item.axisKm),
    unsorted.map((item) => item.eccentricity),
    unsorted.map((item) => item.radiusKm),
    JUPITER_RADIUS_KM,
  );
  const sortedRadii = moonRadiiToScene(
    sorted.map((item) => item.axisKm),
    sorted.map((item) => item.eccentricity),
    sorted.map((item) => item.radiusKm),
    JUPITER_RADIUS_KM,
  );
  for (let index = 0; index < unsorted.length; index += 1) {
    const moonSample = unsorted[index];
    const radius = unsortedRadii[index];
    if (moonSample === undefined || radius === undefined) {
      throw new Error(`missing unsorted moon ${index}`);
    }
    const sortedIndex = sorted.findIndex(
      (item) => item.axisKm === moonSample.axisKm,
    );
    expect(radius).toBeCloseTo(sortedRadii[sortedIndex] ?? Number.NaN, 12);
  }

  const cases: [() => unknown, string, number][] = [
    [
      () => moonRadiiToScene([400_000], [0, 0], [1_000], EARTH_RADIUS_KM),
      'eccentricities',
      2,
    ],
    [
      () => moonRadiiToScene([Number.NaN], [0], [1_000], EARTH_RADIUS_KM),
      'semiMajorAxesKm[0]',
      Number.NaN,
    ],
    [
      () =>
        moonRadiiToScene(
          [Number.POSITIVE_INFINITY],
          [0],
          [1_000],
          EARTH_RADIUS_KM,
        ),
      'semiMajorAxesKm[0]',
      Number.POSITIVE_INFINITY,
    ],
    [
      () => moonRadiiToScene([0], [0], [1_000], EARTH_RADIUS_KM),
      'semiMajorAxesKm[0]',
      0,
    ],
    [
      () => moonRadiiToScene([-1], [0], [1_000], EARTH_RADIUS_KM),
      'semiMajorAxesKm[0]',
      -1,
    ],
    [
      () => moonRadiiToScene([400_000], [0], [Number.NaN], EARTH_RADIUS_KM),
      'radiiKm[0]',
      Number.NaN,
    ],
    [
      () => moonRadiiToScene([400_000], [0], [0], EARTH_RADIUS_KM),
      'radiiKm[0]',
      0,
    ],
    [
      () =>
        moonRadiiToScene(
          [400_000],
          [0],
          [Number.POSITIVE_INFINITY],
          EARTH_RADIUS_KM,
        ),
      'radiiKm[0]',
      Number.POSITIVE_INFINITY,
    ],
    [
      () => moonRadiiToScene([400_000], [-0.1], [1_000], EARTH_RADIUS_KM),
      'eccentricities[0]',
      -0.1,
    ],
    [
      () => moonRadiiToScene([400_000], [1], [1_000], EARTH_RADIUS_KM),
      'eccentricities[0]',
      1,
    ],
    [
      () => moonRadiiToScene([400_000], [Number.NaN], [1_000], EARTH_RADIUS_KM),
      'eccentricities[0]',
      Number.NaN,
    ],
    [
      () =>
        moonRadiiToScene(
          [400_000, 400_000],
          [0, 0],
          [1_000, 1_000],
          EARTH_RADIUS_KM,
        ),
      'semiMajorAxesKm[1]',
      400_000,
    ],
    [() => moonRadiiToScene([400_000], [0], [1_000], 0), 'parentRadiusKm', 0],
    [() => moonRadiiToScene([400_000], [0], [1_000], -1), 'parentRadiusKm', -1],
    [
      () => moonRadiiToScene([400_000], [0], [1_000], Number.NaN),
      'parentRadiusKm',
      Number.NaN,
    ],
    [
      () => moonRadiiToScene([400_000], [0], [1_000], Number.POSITIVE_INFINITY),
      'parentRadiusKm',
      Number.POSITIVE_INFINITY,
    ],
  ];

  for (const [call, parameter, value] of cases) {
    expect(call).toThrow(RangeError);
    expect(call).toThrow(`parameter "${parameter}"`);
    expect(call).toThrow(String(value));
  }

  expect(() =>
    moonRadiiToScene(
      [100_000, 110_000],
      [0.2, 0.2],
      [1_000, 1_000],
      EARTH_RADIUS_KM,
    ),
  ).toThrow(/semiMajorAxesKm\[0\]/);
});

test('SCALE › moonGapFraction', () => {
  expect(SCALE.moonGapFraction).toBeGreaterThan(0);
  expect(SCALE.moonGapFraction).toBeLessThanOrEqual(0.5);
});
