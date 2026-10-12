import { expect, test } from 'vitest';

import { bodies } from '@data/bodies.ts';
import type { BodyDef } from '@data/types.ts';
import {
  WELL,
  addWellDepths,
  clampDepths,
  createWells,
  gridRadius,
  wellDepthAt,
  wellDepthForMass,
  wellProfile,
  wellWidth,
  type Well,
} from '@sim/gravity.ts';
import { distanceToScene, radiusToScene } from '@sim/scale.ts';

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
