import { expect, test } from 'vitest';

import { bodies, getBody } from '@data/bodies.ts';
import type { BodyDef } from '@data/types.ts';
import {
  ARROW,
  WELL,
  accelerationAt,
  addWellDepths,
  auPerDayToKms,
  clampDepths,
  createWells,
  forceArrowLength,
  gridRadius,
  wellDepthAt,
  wellDepthForMass,
  wellProfile,
  wellWidth,
  velocityArrowLength,
  type Well,
} from '@sim/gravity.ts';
import { bodyPositionAu, bodyVelocityAuPerDay } from '@sim/kepler.ts';
import { distanceToScene, radiusToScene, type Vec3 } from '@sim/scale.ts';

function well(overrides: Partial<Well> = {}): Well {
  return {
    id: 'test',
    depth: 2,
    width: 1.5,
    reach: 6,
    x: 0,
    y: 0,
    ...overrides,
  };
}

function wellsById(): Map<string, Well> {
  const wells = createWells(bodies, gridRadius(bodies));
  return new Map(wells.map((item) => [item.id, item]));
}

test('gravity › a heavier body has a deeper well', () => {
  expect(wellDepthForMass(1)).toBe(WELL.depth);
  const ratios = [1e-7, 1e-6, 1e-5, 1e-3, 1];
  for (let index = 1; index < ratios.length; index += 1) {
    expect(wellDepthForMass(ratios[index] ?? 0)).toBeGreaterThan(
      wellDepthForMass(ratios[index - 1] ?? 0),
    );
  }
});

test('gravity › the order of the wells follows the masses', () => {
  const wells = wellsById();
  const depth = (id: string): number => wells.get(id)?.depth ?? Number.NaN;
  expect([...wells.keys()]).toEqual([
    'sun',
    'mercury',
    'venus',
    'earth',
    'mars',
    'jupiter',
    'saturn',
    'uranus',
    'neptune',
  ]);
  expect(depth('sun')).toBeCloseTo(WELL.depth, 1);
  expect(depth('jupiter')).toBeGreaterThan(depth('saturn'));
  expect(depth('saturn')).toBeGreaterThan(depth('neptune'));
  expect(depth('neptune')).toBeGreaterThan(depth('uranus'));
  expect(depth('earth')).toBeGreaterThan(depth('venus'));
  expect(depth('venus')).toBeGreaterThan(depth('mars'));
  expect(depth('mars')).toBeGreaterThan(depth('mercury'));
  expect(depth('mercury')).toBeGreaterThan(0.5);
  for (const item of wells.values()) {
    expect(item.depth).toBeLessThanOrEqual(WELL.maxDepth);
  }
});

test('gravity › a planet carries the mass of its moons', () => {
  const earth = bodies.find((def) => def.id === 'earth');
  const moon = bodies.find((def) => def.id === 'moon');
  const sun = bodies.find((def) => def.id === 'sun');
  if (earth?.mass === undefined || moon?.mass === undefined || !sun?.mass) {
    throw new Error('missing masses');
  }
  expect(wellsById().get('earth')?.depth).toBeCloseTo(
    wellDepthForMass((earth.mass + moon.mass) / sun.mass),
    10,
  );
  expect(wellsById().has('moon')).toBe(false);
});

test('gravity › widths follow the scene radius within bounds', () => {
  expect(wellWidth(0.01)).toBe(WELL.widthMin);
  expect(wellWidth(100)).toBe(WELL.widthMax);
  expect(wellWidth(1)).toBeCloseTo(WELL.widthFactor, 10);
  const wells = wellsById();
  const jupiter = bodies.find((def) => def.id === 'jupiter');
  if (!jupiter) {
    throw new Error('missing jupiter');
  }
  expect(wells.get('jupiter')?.width).toBeCloseTo(
    wellWidth(radiusToScene(jupiter.radiusKm)),
    10,
  );
  expect(wells.get('jupiter')?.reach).toBeCloseTo(
    WELL.reachWidths * (wells.get('jupiter')?.width ?? 0),
    10,
  );
  expect(wells.get('sun')?.reach).toBe(gridRadius(bodies));
});

test('gravity › the grid covers every orbit', () => {
  const radius = gridRadius(bodies);
  for (const def of bodies) {
    if (def.type === 'planet' && def.orbit !== undefined) {
      const aphelion = def.orbit.semiMajorAxisAu * (1 + def.orbit.eccentricity);
      expect(radius).toBeGreaterThan(distanceToScene(aphelion));
    }
  }
  expect(() => gridRadius([])).toThrow(RangeError);
});

test('gravity › the profile is deepest at the center and ends at the reach', () => {
  const item = well();
  expect(wellProfile(0, item)).toBeCloseTo(item.depth, 10);
  expect(wellProfile(item.reach, item)).toBe(0);
  expect(wellProfile(item.reach + 1, item)).toBe(0);
  expect(wellProfile(item.reach - 1e-6, item)).toBeCloseTo(0, 5);
  let previous = Number.POSITIVE_INFINITY;
  for (let distance = 0; distance <= item.reach; distance += 0.25) {
    const value = wellProfile(distance, item);
    expect(value).toBeLessThan(previous);
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    previous = value;
  }
});

test('gravity › a single well is round', () => {
  const item = well({ x: 3, y: -2 });
  const wells = [item];
  for (const angle of [0, 0.7, 1.9, 3.3, 5.1]) {
    const x = 3 + 2 * Math.cos(angle);
    const y = -2 + 2 * Math.sin(angle);
    expect(wellDepthAt(x, y, wells)).toBeCloseTo(wellProfile(2, item), 10);
  }
});

test('gravity › depths add up and are clamped', () => {
  const deep = well({ depth: WELL.maxDepth });
  expect(wellDepthAt(0, 0, [deep, deep])).toBe(WELL.maxDepth);
  const small = well({ depth: 1 });
  expect(wellDepthAt(0, 0, [small, small])).toBeCloseTo(2, 10);

  const depths = Float32Array.from([1, WELL.maxDepth + 5, 0]);
  clampDepths(depths);
  expect([...depths]).toEqual([1, WELL.maxDepth, 0]);
});

test('gravity › addWellDepths matches single samples', () => {
  const wells = [well({ x: 1, y: 1 }), well({ x: -4, y: 2, depth: 1 })];
  const xs = Float32Array.from([1, 0, -4, 10, -2.5]);
  const ys = Float32Array.from([1, 0, 2, 10, 1.5]);
  const out = new Float32Array(xs.length);
  addWellDepths(xs, ys, wells, out);
  for (let index = 0; index < xs.length; index += 1) {
    expect(out[index]).toBeCloseTo(
      wellDepthAt(xs[index] ?? 0, ys[index] ?? 0, wells),
      5,
    );
  }
  expect(out[3]).toBe(0);
  expect(() =>
    addWellDepths(xs, ys, wells, new Float32Array(xs.length - 1)),
  ).toThrow(RangeError);
});

test('gravity › invalid input throws RangeError', () => {
  expect(() => wellDepthForMass(0)).toThrow(
    'wellDepthForMass: parameter "massRatio" must be finite and > 0, got 0',
  );
  expect(() => wellDepthForMass(Number.NaN)).toThrow(RangeError);
  expect(() => wellWidth(-1)).toThrow(
    'wellWidth: parameter "sceneRadius" must be finite and > 0, got -1',
  );
  expect(() => wellProfile(-1, well())).toThrow(
    'wellProfile: parameter "distance" must be finite and >= 0, got -1',
  );
  expect(() => wellProfile(Number.NaN, well())).toThrow(RangeError);
  expect(() => wellProfile(Number.POSITIVE_INFINITY, well())).toThrow(
    RangeError,
  );
  expect(() => createWells(bodies, 0)).toThrow(
    'createWells: parameter "starReach" must be finite and > 0, got 0',
  );
});

test('gravity › bodies without a mass are reported', () => {
  const withoutMass = (def: BodyDef): BodyDef => {
    const copy = { ...def };
    delete copy.mass;
    return copy;
  };
  const noStarMass = bodies.map((def) =>
    def.type === 'star' ? withoutMass(def) : def,
  );
  expect(() => createWells(noStarMass, 10)).toThrow(
    'createWells: the star has no mass',
  );
  const noPlanetMass = bodies.map((def) =>
    def.id === 'mars' ? withoutMass(def) : def,
  );
  expect(() => createWells(noPlanetMass, 10)).toThrow(
    'createWells: body "mars" has no mass',
  );
});

const SUN_MASS = getBody('sun').mass ?? Number.NaN;

function vec(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function size(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

function speedKms(id: string, days: number): number {
  return auPerDayToKms(
    size(bodyVelocityAuPerDay(getBody(id), days, vec(0, 0, 0))),
  );
}

// Days of perihelion and aphelion, from a scan of one period.
function apsides(id: string): { peri: number; apo: number } {
  const def = getBody(id);
  const period = def.orbit?.periodDays ?? Number.NaN;
  const place = vec(0, 0, 0);
  let peri = 0;
  let apo = 0;
  let near = Number.POSITIVE_INFINITY;
  let far = 0;
  for (let step = 0; step < 4000; step += 1) {
    const days = (period * step) / 4000;
    const distance = size(bodyPositionAu(def, days, place));
    if (distance < near) {
      near = distance;
      peri = days;
    }
    if (distance > far) {
      far = distance;
      apo = days;
    }
  }
  return { peri, apo };
}

test('gravity › the acceleration points at the Sun', () => {
  for (const place of [vec(1, 0, 0), vec(-0.3, 0.4, 0.1), vec(5, -12, 0)]) {
    const out = accelerationAt(place, SUN_MASS, vec(0, 0, 0));
    const cosine =
      (out.x * place.x + out.y * place.y + out.z * place.z) /
      (size(out) * size(place));
    expect(cosine).toBeCloseTo(-1, 12);
  }
});

test('gravity › the acceleration falls as 1 / r²', () => {
  const near = size(accelerationAt(vec(1, 0, 0), SUN_MASS, vec(0, 0, 0)));
  for (const distance of [0.39, 2, 5.2, 30]) {
    const far = size(
      accelerationAt(vec(0, distance, 0), SUN_MASS, vec(0, 0, 0)),
    );
    expect(far * distance * distance).toBeCloseTo(near, 12);
  }
  // About 5.9 mm/s² at Earth's distance.
  expect(near).toBeCloseTo(5.93e-3, 4);
});

test('gravity › accelerationAt checks its input', () => {
  expect(() => accelerationAt(vec(0, 0, 0), SUN_MASS, vec(0, 0, 0))).toThrow(
    'positionAu',
  );
  expect(() =>
    accelerationAt(vec(Number.NaN, 0, 0), SUN_MASS, vec(0, 0, 0)),
  ).toThrow(RangeError);
  expect(() => accelerationAt(vec(1, 0, 0), 0, vec(0, 0, 0))).toThrow(
    'starMass',
  );
});

test('gravity › Earth moves at about 29.8 km/s', () => {
  for (const days of [0, 100, 200, 300]) {
    expect(speedKms('earth', days)).toBeGreaterThan(29.2);
    expect(speedKms('earth', days)).toBeLessThan(30.4);
  }
  const mean = (speedKms('earth', 0) + speedKms('earth', 182.6)) / 2;
  expect(mean).toBeCloseTo(29.8, 0);
});

test.each(['mercury', 'mars', 'earth'])(
  'gravity › %s is faster at perihelion than at aphelion',
  (id) => {
    const { peri, apo } = apsides(id);
    expect(speedKms(id, peri)).toBeGreaterThan(speedKms(id, apo));
  },
);

test('gravity › Mercury at perihelion and aphelion, NASA values', () => {
  const { peri, apo } = apsides('mercury');
  expect(speedKms('mercury', peri)).toBeCloseTo(58.98, 0);
  expect(speedKms('mercury', apo)).toBeCloseTo(38.86, 0);
});

test('gravity › on a circular orbit the velocity is perpendicular to the radius', () => {
  const def = {
    ...getBody('earth'),
    orbit: { ...getBody('earth').orbit, eccentricity: 0 },
  } as BodyDef;
  for (const days of [0, 91, 222]) {
    const place = bodyPositionAu(def, days, vec(0, 0, 0));
    const motion = bodyVelocityAuPerDay(def, days, vec(0, 0, 0));
    const cosine =
      (place.x * motion.x + place.y * motion.y + place.z * motion.z) /
      (size(place) * size(motion));
    expect(cosine).toBeCloseTo(0, 12);
  }
});

test('gravity › auPerDayToKms', () => {
  expect(auPerDayToKms(1)).toBeCloseTo(1731.456837, 5);
  expect(auPerDayToKms(0)).toBe(0);
  expect(() => auPerDayToKms(Number.NaN)).toThrow(RangeError);
});

test('gravity › arrow lengths grow with the value', () => {
  const forces = [1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 0.1, 1];
  for (let index = 1; index < forces.length; index += 1) {
    expect(forceArrowLength(forces[index] ?? 0)).toBeGreaterThanOrEqual(
      forceArrowLength(forces[index - 1] ?? 0),
    );
  }
  const speeds = [0, 1, 5, 10, 20, 30, 50, 100, 1000];
  for (let index = 1; index < speeds.length; index += 1) {
    expect(velocityArrowLength(speeds[index] ?? 0)).toBeGreaterThanOrEqual(
      velocityArrowLength(speeds[index - 1] ?? 0),
    );
  }
  expect(forceArrowLength(ARROW.forceRefMs2)).toBeCloseTo(
    ARROW.forceRefLength,
    12,
  );
  expect(velocityArrowLength(ARROW.velocityRefKms)).toBeCloseTo(
    ARROW.velocityRefLength,
    12,
  );
});

test('gravity › arrow lengths stay within their bounds', () => {
  expect(forceArrowLength(0)).toBe(ARROW.forceMin);
  expect(forceArrowLength(1e3)).toBe(ARROW.forceMax);
  expect(velocityArrowLength(0)).toBe(ARROW.velocityMin);
  expect(velocityArrowLength(1e5)).toBe(ARROW.velocityMax);
  for (const value of [1e-9, 1e-5, 1e-2, 1]) {
    expect(forceArrowLength(value)).toBeGreaterThanOrEqual(ARROW.forceMin);
    expect(forceArrowLength(value)).toBeLessThanOrEqual(ARROW.forceMax);
  }
  expect(() => forceArrowLength(-1)).toThrow(RangeError);
  expect(() => velocityArrowLength(Number.NaN)).toThrow(RangeError);
});

test('gravity › every planet gets arrows inside the bounds, closer is longer', () => {
  const planets = bodies.filter((def) => def.type === 'planet');
  let lastForce = Number.POSITIVE_INFINITY;
  let lastSpeed = Number.POSITIVE_INFINITY;
  for (const def of planets) {
    const place = bodyPositionAu(def, 0, vec(0, 0, 0));
    const force = forceArrowLength(
      size(accelerationAt(place, SUN_MASS, vec(0, 0, 0))),
    );
    const speed = velocityArrowLength(speedKms(def.id, 0));
    // Not clamped, so the arrows keep telling the planets apart.
    expect(force).toBeGreaterThan(ARROW.forceMin);
    expect(force).toBeLessThan(ARROW.forceMax);
    expect(speed).toBeGreaterThan(ARROW.velocityMin);
    expect(speed).toBeLessThan(ARROW.velocityMax);
    expect(force).toBeLessThan(lastForce);
    expect(speed).toBeLessThan(lastSpeed);
    lastForce = force;
    lastSpeed = speed;
  }
});

test('gravity › Mercury and Mars arrows change between perihelion and aphelion', () => {
  for (const id of ['mercury', 'mars']) {
    const { peri, apo } = apsides(id);
    const nearSpeed = velocityArrowLength(speedKms(id, peri));
    const farSpeed = velocityArrowLength(speedKms(id, apo));
    // At least a tenth longer: visible side by side.
    expect(nearSpeed / farSpeed).toBeGreaterThan(1.1);
  }
});
