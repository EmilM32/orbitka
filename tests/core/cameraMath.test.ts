import { expect, test } from 'vitest';

import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import {
  blendPose,
  bodyDistanceLimits,
  clampDistance,
  clampPolar,
  dampingFraction,
  easeInOutCubic,
  flightGoalDistance,
  flightProgress,
  lerp,
  lerpAngle,
  poseToPosition,
  positionToPose,
  rotatePose,
  setDefaultPose,
  softClampDistance,
  startDistance,
  systemDistanceLimits,
  wrapAzimuth,
  zoomDistance,
  type CameraPose,
  type DistanceLimits,
  type Vec3,
} from '@core/cameraMath.ts';

const DEG = Math.PI / 180;
const POLAR_MIN = (CAMERA_CONFIG.polarMinDeg * Math.PI) / 180;
const POLAR_MAX = (CAMERA_CONFIG.polarMaxDeg * Math.PI) / 180;
const NON_FINITE = [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
] as const;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pose(
  azimuth = 0,
  polar = 1,
  distance = 10,
  targetX = 0,
  targetY = 0,
  targetZ = 0,
): CameraPose {
  return { azimuth, polar, distance, targetX, targetY, targetZ };
}

function limits(min = 1, max = 10): DistanceLimits {
  return { min, max };
}

function vec(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

function expectRangeError(run: () => void, message: string): void {
  expect(run).toThrow(RangeError);
  expect(run).toThrow(message);
}

function message(
  functionName: string,
  parameter: string,
  requirement: string,
  value: number,
): string {
  return `${functionName}: parameter "${parameter}" ${requirement}, got ${value}`;
}

function gap(value: number, range: DistanceLimits): number {
  if (value < range.min) {
    return range.min - value;
  }
  if (value > range.max) {
    return value - range.max;
  }
  return 0;
}

test('setDefaultPose › 16:9 start pose', () => {
  const out = pose(1, 1, 1, 4, 5, 6);
  expect(setDefaultPose(out, 16 / 9)).toBe(out);
  expect(out.azimuth).toBe(0);
  expect(out.polar).toBeCloseTo(0.959931, 5);
  expect(out.polar).toBeCloseTo(55 * DEG, 12);
  expect(out.distance).toBe(Math.hypot(75, 95));
  expect(out.targetX).toBe(0);
  expect(out.targetY).toBe(0);
  expect(out.targetZ).toBe(0);

  const position = vec(1, 1, 1);
  expect(poseToPosition(position, out)).toBe(position);
  expect(Math.abs(position.x)).toBeLessThan(1e-9);
  expect(Math.abs(position.y - 69.4241)).toBeLessThan(1e-3);
  expect(Math.abs(position.z - 99.1479)).toBeLessThan(1e-3);
  expect(Math.hypot(position.x, position.y, position.z)).toBeCloseTo(
    out.distance,
    9,
  );
});

test('startDistance › aspect multiplier', () => {
  const base = Math.hypot(75, 95);
  expect(startDistance(0.5625)).toBe(base * (1.2 / 0.5625));
  expect(startDistance(0.5625) / base).toBeCloseTo(2.1333333333, 6);
  expect(startDistance(1.2)).toBe(base);
  expect(startDistance(1.7778)).toBe(base);
  expect(startDistance(2)).toBe(base);
  expect(startDistance(16 / 9)).toBe(base);
});

test('distance limits', () => {
  const start = startDistance(16 / 9);
  const system = limits(0, 0);
  expect(systemDistanceLimits(system, start)).toBe(system);
  expect(system.min).toBe(0.2 * start);
  expect(system.max).toBe(1.5 * start);
  expect(Math.abs(system.min - 24.207)).toBeLessThan(1e-3);
  expect(Math.abs(system.max - 181.556)).toBeLessThan(1e-3);

  const body = limits(0, 0);
  expect(bodyDistanceLimits(body, start, 4)).toBe(body);
  expect(body.min).toBe(2.5 * 4);
  expect(body.max).toBe(start);

  const touching = limits(0, 0);
  bodyDistanceLimits(touching, 10, 4);
  expect(touching.min).toBe(10);
  expect(touching.max).toBe(10);
});

test('flightGoalDistance', () => {
  for (const radius of [0.5, 1, 3.26]) {
    expect(flightGoalDistance(radius, false)).toBe(6 * radius);
    expect(flightGoalDistance(radius, true)).toBe(3.5 * radius);
  }
});

test('clampPolar › property', () => {
  expect(clampPolar(0)).toBeCloseTo(POLAR_MIN, 12);
  expect(clampPolar(Math.PI)).toBeCloseTo(POLAR_MAX, 12);
  expect(clampPolar(-1)).toBeCloseTo(POLAR_MIN, 12);
  expect(clampPolar(1e9)).toBeCloseTo(POLAR_MAX, 12);
  expect(clampPolar(1)).toBe(1);

  const random = mulberry32(181);
  for (let index = 0; index < 2000; index += 1) {
    const sample = (random() * 2 - 1) * 1e6;
    const clamped = clampPolar(sample);
    expect(clamped).toBeGreaterThanOrEqual(POLAR_MIN);
    expect(clamped).toBeLessThanOrEqual(POLAR_MAX);
    expect(clampPolar(clamped)).toBe(clamped);
  }
});

test('wrapAzimuth › property', () => {
  expect(wrapAzimuth(0)).toBe(0);
  expect(wrapAzimuth(Math.PI)).toBeCloseTo(Math.PI, 12);
  expect(wrapAzimuth(-Math.PI)).toBeCloseTo(Math.PI, 12);
  expect(wrapAzimuth(Math.PI + 0.2)).toBeCloseTo(-Math.PI + 0.2, 12);
  expect(wrapAzimuth(-Math.PI - 0.2)).toBeCloseTo(Math.PI - 0.2, 12);

  for (const sample of [1e9, -1e9]) {
    const wrapped = wrapAzimuth(sample);
    expect(Number.isFinite(wrapped)).toBe(true);
    expect(wrapped).toBeGreaterThan(-Math.PI);
    expect(wrapped).toBeLessThanOrEqual(Math.PI);
  }

  const random = mulberry32(182);
  for (let index = 0; index < 2000; index += 1) {
    const sample = (random() * 2 - 1) * 40 * Math.PI;
    const wrapped = wrapAzimuth(sample);
    expect(wrapped).toBeGreaterThan(-Math.PI);
    expect(wrapped).toBeLessThanOrEqual(Math.PI);
    expect(Math.cos(wrapped)).toBeCloseTo(Math.cos(sample), 9);
    expect(Math.sin(wrapped)).toBeCloseTo(Math.sin(sample), 9);
  }
});

test('rotatePose › wraps azimuth and clamps polar', () => {
  const turned = rotatePose(pose(170 * DEG, 1, 8, 1, 2, 3), 20 * DEG, 0);
  expect(turned.azimuth).toBeCloseTo(-170 * DEG, 10);
  expect(turned.polar).toBe(1);
  expect(turned.distance).toBe(8);
  expect(turned.targetX).toBe(1);

  const clamped = rotatePose(pose(0, POLAR_MAX - 0.01), 0, 1);
  expect(clamped.polar).toBe(POLAR_MAX);
  expect(rotatePose(pose(0, POLAR_MIN + 0.01), 0, -1).polar).toBe(POLAR_MIN);
});

test('zoomDistance › scales then clamps', () => {
  const range = limits(2, 10);
  expect(zoomDistance(5, 0.9, range)).toBeCloseTo(4.5, 12);
  expect(zoomDistance(5, 1.1, range)).toBeCloseTo(5.5, 12);
  expect(zoomDistance(5, 0.1, range)).toBe(2);
  expect(zoomDistance(5, 10, range)).toBe(10);
});

test('softClampDistance', () => {
  const start = startDistance(16 / 9);
  const bodyMax = 1 * start;
  const bodyMin = 0.2 * start;
  const outside = limits(bodyMin, bodyMax);
  expect(softClampDistance(1.3 * start, 1.2 * start, outside)).toBe(
    1.2 * start,
  );
  expect(softClampDistance(1.3 * start, 1.4 * start, outside)).toBe(
    1.3 * start,
  );
  expect(softClampDistance(1.3 * start, 0.1 * start, outside)).toBe(
    0.2 * start,
  );

  const low = limits(0.2, 1);
  expect(softClampDistance(0.1, 0.05, low)).toBe(0.1);
  expect(softClampDistance(0.1, 0.5, low)).toBe(0.5);
  expect(softClampDistance(0.1, 2, low)).toBe(1);

  const inside = limits(2, 8);
  expect(softClampDistance(5, 6, inside)).toBe(clampDistance(6, inside));
  expect(softClampDistance(5, 20, inside)).toBe(clampDistance(20, inside));
  expect(softClampDistance(5, 0.5, inside)).toBe(2);
  expect(softClampDistance(2, 3, inside)).toBe(3);
  expect(softClampDistance(8, 7, inside)).toBe(7);

  const random = mulberry32(183);
  for (let index = 0; index < 2000; index += 1) {
    const min = random() * 40 - 10;
    const max = min + random() * 50 + 0.01;
    const range = limits(min, max);
    const current = random() * 120 - 40;
    const proposed = random() * 120 - 40;
    const result = softClampDistance(current, proposed, range);
    expect(gap(result, range)).toBeLessThanOrEqual(gap(current, range) + 1e-9);
    if (current >= min && current <= max) {
      expect(result).toBe(clampDistance(proposed, range));
    } else if (current > max) {
      expect(result).toBeLessThanOrEqual(current);
      if (proposed < min) {
        expect(result).toBe(min);
      } else {
        expect(result).toBeLessThanOrEqual(proposed);
      }
    } else {
      expect(result).toBeGreaterThanOrEqual(current);
      if (proposed > max) {
        expect(result).toBe(max);
      } else {
        expect(result).toBeGreaterThanOrEqual(proposed);
      }
    }
  }
});

test('pose position round trip', () => {
  const origin = pose(0, Math.PI / 2, 2, 0, 0, 0);
  const onAxis = vec();
  poseToPosition(onAxis, origin);
  expect(onAxis.x).toBeCloseTo(0, 12);
  expect(onAxis.y).toBeCloseTo(0, 12);
  expect(onAxis.z).toBeCloseTo(2, 12);

  const shifted = pose(0, Math.PI / 2, 2, 1, 2, 3);
  const shiftedPosition = vec();
  poseToPosition(shiftedPosition, shifted);
  expect(shiftedPosition).toEqual({ x: 1, y: 2, z: 5 });

  const same = pose();
  positionToPose(same, vec(4, 5, 6), vec(4, 5, 6));
  expect(same.distance).toBe(0);
  expect(same.azimuth).toBe(0);
  expect(same.polar).toBe(0);
  expect(same.targetX).toBe(4);
  const back = vec();
  poseToPosition(back, same);
  expect(back).toEqual({ x: 4, y: 5, z: 6 });

  const random = mulberry32(184);
  const scratch = pose();
  const round = vec();
  for (let index = 0; index < 1000; index += 1) {
    const target = vec(
      random() * 100 - 50,
      random() * 100 - 50,
      random() * 100 - 50,
    );
    const position = vec(
      target.x + random() * 80 - 40,
      target.y + random() * 80 - 40,
      target.z + random() * 80 - 40,
    );
    positionToPose(scratch, position, target);
    poseToPosition(round, scratch);
    expect(
      Math.hypot(
        round.x - position.x,
        round.y - position.y,
        round.z - position.z,
      ),
    ).toBeLessThan(1e-9);
    expect(scratch.targetX).toBe(target.x);
    expect(scratch.targetY).toBe(target.y);
    expect(scratch.targetZ).toBe(target.z);
  }
});

test('lerp › linear and shortest angle', () => {
  expect(lerp(0, 10, 0.25)).toBe(2.5);
  expect(lerpAngle(0.1, 0.3, 0)).toBe(0.1);
  expect(lerpAngle(0.1, 0.3, 1)).toBe(0.3);
  expect(lerpAngle(170 * DEG, -170 * DEG, 0.5)).toBeCloseTo(Math.PI, 8);
});

test('easeInOutCubic › properties', () => {
  expect(easeInOutCubic(0)).toBe(0);
  expect(easeInOutCubic(1)).toBe(1);
  expect(easeInOutCubic(0.5)).toBe(0.5);

  let previous = easeInOutCubic(0);
  for (let index = 1; index <= 1000; index += 1) {
    const value = easeInOutCubic(index / 1000);
    expect(value).toBeGreaterThanOrEqual(previous);
    previous = value;
  }

  for (let index = 0; index <= 1000; index += 1) {
    const t = index / 1000;
    expect(easeInOutCubic(t) + easeInOutCubic(1 - t)).toBeCloseTo(1, 12);
  }

  const step = 1e-3;
  expect(
    Math.abs((easeInOutCubic(step) - easeInOutCubic(0)) / step),
  ).toBeLessThan(1e-2);
  expect(
    Math.abs((easeInOutCubic(1) - easeInOutCubic(1 - step)) / step),
  ).toBeLessThan(1e-2);
});

test('blendPose', () => {
  const from = pose(0.2, 0.4, 5, 1, 2, 3);
  const to = pose(1.2, 1.1, 9, 4, 6, 8);
  const start = pose();
  blendPose(start, from, to, 0);
  expect(start).toEqual(from);
  const end = pose();
  blendPose(end, from, to, 1);
  expect(end).toEqual(to);

  const across = pose();
  blendPose(
    across,
    pose(170 * DEG, 0.5, 4, 0, 0, 0),
    pose(-170 * DEG, 1.5, 8, 1, 1, 1),
    0.5,
  );
  expect(across.azimuth).toBeCloseTo(Math.PI, 8);
  expect(Math.abs(across.azimuth)).toBeGreaterThan(Math.PI / 2);
  expect(across.polar).toBeCloseTo(1, 12);
  expect(across.distance).toBeCloseTo(6, 12);
  expect(across.targetX).toBeCloseTo(0.5, 12);
  for (const value of Object.values(across)) {
    expect(Number.isNaN(value)).toBe(false);
  }

  const aliasedFrom = pose(0.3, 0.6, 2, -1, 0, 4);
  const aliasedTo = pose(-0.4, 1.2, 7, 3, 1, -2);
  const reference = pose();
  blendPose(reference, aliasedFrom, aliasedTo, 0.3);
  const fromCopy = pose(
    aliasedFrom.azimuth,
    aliasedFrom.polar,
    aliasedFrom.distance,
    aliasedFrom.targetX,
    aliasedFrom.targetY,
    aliasedFrom.targetZ,
  );
  const toCopy = pose(
    aliasedTo.azimuth,
    aliasedTo.polar,
    aliasedTo.distance,
    aliasedTo.targetX,
    aliasedTo.targetY,
    aliasedTo.targetZ,
  );
  blendPose(aliasedFrom, aliasedFrom, toCopy, 0.3);
  expect(aliasedFrom).toEqual(reference);
  blendPose(aliasedTo, fromCopy, aliasedTo, 0.3);
  expect(aliasedTo).toEqual(reference);
});

test('dampingFraction', () => {
  expect(dampingFraction(0)).toBe(0);
  expect(dampingFraction(1 / 60)).toBeCloseTo(0.08, 12);

  let rest = 1;
  for (let frame = 0; frame < 36; frame += 1) {
    rest *= 1 - dampingFraction(1 / 60);
  }
  expect(rest).toBeLessThanOrEqual(0.05);

  let sixSteps = 1;
  for (let frame = 0; frame < 6; frame += 1) {
    sixSteps *= 1 - dampingFraction(1 / 60);
  }
  const oneStep = 1 - dampingFraction(0.1);
  expect(Math.abs(sixSteps - oneStep)).toBeLessThan(1e-9);
});

test('flightProgress › duration', () => {
  expect(flightProgress(0, 1.2)).toBe(0);
  expect(flightProgress(0.6, 1.2)).toBeCloseTo(0.5, 12);
  expect(flightProgress(2, 1.2)).toBe(1);
  expect(flightProgress(0, 0)).toBe(1);
  expect(flightProgress(3, 0)).toBe(1);
});

test('invalid input', () => {
  const blank = pose();
  const range = limits(1, 4);
  const point = vec(1, 2, 3);

  expectRangeError(
    () => startDistance(0),
    message('startDistance', 'aspect', 'must be finite and > 0', 0),
  );
  expectRangeError(
    () => startDistance(-2),
    message('startDistance', 'aspect', 'must be finite and > 0', -2),
  );
  expectRangeError(
    () => setDefaultPose(blank, 0),
    message('startDistance', 'aspect', 'must be finite and > 0', 0),
  );
  expectRangeError(
    () => bodyDistanceLimits(range, 10, -1),
    message(
      'bodyDistanceLimits',
      'displayRadius',
      'must be finite and > 0',
      -1,
    ),
  );
  expectRangeError(
    () => bodyDistanceLimits(range, 10, 0),
    message('bodyDistanceLimits', 'displayRadius', 'must be finite and > 0', 0),
  );
  expectRangeError(
    () => bodyDistanceLimits(range, 10, 5),
    message(
      'bodyDistanceLimits',
      'displayRadius',
      'must be <= startDist / 2.5',
      5,
    ),
  );
  expectRangeError(
    () => zoomDistance(4, 0, range),
    message('zoomDistance', 'factor', 'must be finite and > 0', 0),
  );
  expectRangeError(
    () => zoomDistance(4, -2, range),
    message('zoomDistance', 'factor', 'must be finite and > 0', -2),
  );
  expectRangeError(
    () => easeInOutCubic(1.0000001),
    message('easeInOutCubic', 't', 'must be within [0, 1]', 1.0000001),
  );
  expectRangeError(
    () => easeInOutCubic(-0.0000001),
    message('easeInOutCubic', 't', 'must be within [0, 1]', -0.0000001),
  );
  expectRangeError(
    () => blendPose(blank, pose(), pose(), 1.0000001),
    message('blendPose', 't', 'must be within [0, 1]', 1.0000001),
  );
  expectRangeError(
    () => flightProgress(-1, 1),
    message('flightProgress', 'elapsedSeconds', 'must be finite and >= 0', -1),
  );
  expectRangeError(
    () => flightProgress(1, -1),
    message('flightProgress', 'durationSeconds', 'must be finite and >= 0', -1),
  );
  expectRangeError(
    () => dampingFraction(-1),
    message('dampingFraction', 'dtSeconds', 'must be finite and >= 0', -1),
  );
  expectRangeError(
    () => clampPolar(Number.NaN),
    message('clampPolar', 'polar', 'must be finite', Number.NaN),
  );
  expectRangeError(
    () => clampDistance(1, limits(5, 3)),
    'clampDistance: parameter "limits" must satisfy min <= max, got min=5 max=3',
  );
  expectRangeError(
    () => softClampDistance(1, 1, limits(5, 3)),
    'softClampDistance: parameter "limits" must satisfy min <= max, got min=5 max=3',
  );
  expectRangeError(
    () => zoomDistance(1, 1, limits(5, 3)),
    'zoomDistance: parameter "limits" must satisfy min <= max, got min=5 max=3',
  );
  expectRangeError(
    () => zoomDistance(1e308, 10, range),
    message(
      'zoomDistance',
      'distance',
      'must be finite',
      Number.POSITIVE_INFINITY,
    ),
  );

  const finiteCases: Array<{
    functionName: string;
    parameter: string;
    requirement: string;
    run: (value: number) => void;
  }> = [
    {
      functionName: 'startDistance',
      parameter: 'aspect',
      requirement: 'must be finite and > 0',
      run: (value) => startDistance(value),
    },
    {
      functionName: 'startDistance',
      parameter: 'aspect',
      requirement: 'must be finite and > 0',
      run: (value) => {
        setDefaultPose(pose(), value);
      },
    },
    {
      functionName: 'systemDistanceLimits',
      parameter: 'startDist',
      requirement: 'must be finite and > 0',
      run: (value) => systemDistanceLimits(limits(), value),
    },
    {
      functionName: 'bodyDistanceLimits',
      parameter: 'startDist',
      requirement: 'must be finite and > 0',
      run: (value) => bodyDistanceLimits(limits(), value, 1),
    },
    {
      functionName: 'bodyDistanceLimits',
      parameter: 'displayRadius',
      requirement: 'must be finite and > 0',
      run: (value) => bodyDistanceLimits(limits(), 10, value),
    },
    {
      functionName: 'flightGoalDistance',
      parameter: 'displayRadius',
      requirement: 'must be finite and > 0',
      run: (value) => flightGoalDistance(value, false),
    },
    {
      functionName: 'clampPolar',
      parameter: 'polar',
      requirement: 'must be finite',
      run: (value) => clampPolar(value),
    },
    {
      functionName: 'clampDistance',
      parameter: 'distance',
      requirement: 'must be finite',
      run: (value) => clampDistance(value, range),
    },
    {
      functionName: 'clampDistance',
      parameter: 'min',
      requirement: 'must be finite',
      run: (value) => clampDistance(2, limits(value, 4)),
    },
    {
      functionName: 'clampDistance',
      parameter: 'max',
      requirement: 'must be finite',
      run: (value) => clampDistance(2, limits(1, value)),
    },
    {
      functionName: 'wrapAzimuth',
      parameter: 'azimuth',
      requirement: 'must be finite',
      run: (value) => wrapAzimuth(value),
    },
    {
      functionName: 'zoomDistance',
      parameter: 'distance',
      requirement: 'must be finite',
      run: (value) => zoomDistance(value, 1, range),
    },
    {
      functionName: 'zoomDistance',
      parameter: 'factor',
      requirement: 'must be finite and > 0',
      run: (value) => zoomDistance(2, value, range),
    },
    {
      functionName: 'softClampDistance',
      parameter: 'current',
      requirement: 'must be finite',
      run: (value) => softClampDistance(value, 2, range),
    },
    {
      functionName: 'softClampDistance',
      parameter: 'proposed',
      requirement: 'must be finite',
      run: (value) => softClampDistance(2, value, range),
    },
    {
      functionName: 'softClampDistance',
      parameter: 'min',
      requirement: 'must be finite',
      run: (value) => softClampDistance(2, 2, limits(value, 4)),
    },
    {
      functionName: 'softClampDistance',
      parameter: 'max',
      requirement: 'must be finite',
      run: (value) => softClampDistance(2, 2, limits(1, value)),
    },
    {
      functionName: 'easeInOutCubic',
      parameter: 't',
      requirement: 'must be within [0, 1]',
      run: (value) => easeInOutCubic(value),
    },
    {
      functionName: 'flightProgress',
      parameter: 'elapsedSeconds',
      requirement: 'must be finite and >= 0',
      run: (value) => flightProgress(value, 1),
    },
    {
      functionName: 'flightProgress',
      parameter: 'durationSeconds',
      requirement: 'must be finite and >= 0',
      run: (value) => flightProgress(0, value),
    },
    {
      functionName: 'lerp',
      parameter: 'a',
      requirement: 'must be finite',
      run: (value) => lerp(value, 1, 0.5),
    },
    {
      functionName: 'lerp',
      parameter: 'b',
      requirement: 'must be finite',
      run: (value) => lerp(0, value, 0.5),
    },
    {
      functionName: 'lerp',
      parameter: 't',
      requirement: 'must be finite',
      run: (value) => lerp(0, 1, value),
    },
    {
      functionName: 'lerpAngle',
      parameter: 'a',
      requirement: 'must be finite',
      run: (value) => lerpAngle(value, 1, 0.5),
    },
    {
      functionName: 'lerpAngle',
      parameter: 'b',
      requirement: 'must be finite',
      run: (value) => lerpAngle(0, value, 0.5),
    },
    {
      functionName: 'lerpAngle',
      parameter: 't',
      requirement: 'must be finite',
      run: (value) => lerpAngle(0, 1, value),
    },
    {
      functionName: 'dampingFraction',
      parameter: 'dtSeconds',
      requirement: 'must be finite and >= 0',
      run: (value) => dampingFraction(value),
    },
  ];

  const poseFields = [
    'azimuth',
    'polar',
    'distance',
    'targetX',
    'targetY',
    'targetZ',
  ] as const;

  for (const field of poseFields) {
    finiteCases.push(
      {
        functionName: 'rotatePose',
        parameter: field,
        requirement: 'must be finite',
        run: (value) => {
          const sample = pose();
          sample[field] = value;
          rotatePose(sample, 0.1, 0.1);
        },
      },
      {
        functionName: 'poseToPosition',
        parameter: field,
        requirement: 'must be finite',
        run: (value) => {
          const sample = pose();
          sample[field] = value;
          poseToPosition(vec(), sample);
        },
      },
      {
        functionName: 'blendPose',
        parameter: field,
        requirement: 'must be finite',
        run: (value) => {
          const sample = pose();
          sample[field] = value;
          blendPose(pose(), sample, pose(0.2, 0.2, 3, 1, 1, 1), 0.4);
        },
      },
      {
        functionName: 'blendPose',
        parameter: field,
        requirement: 'must be finite',
        run: (value) => {
          const sample = pose();
          sample[field] = value;
          blendPose(pose(), pose(0.2, 0.2, 3, 1, 1, 1), sample, 0.4);
        },
      },
    );
  }

  finiteCases.push(
    {
      functionName: 'rotatePose',
      parameter: 'dAzimuth',
      requirement: 'must be finite',
      run: (value) => rotatePose(pose(), value, 0.1),
    },
    {
      functionName: 'rotatePose',
      parameter: 'dPolar',
      requirement: 'must be finite',
      run: (value) => rotatePose(pose(), 0.1, value),
    },
    {
      functionName: 'positionToPose',
      parameter: 'x',
      requirement: 'must be finite',
      run: (value) => positionToPose(pose(), vec(value, 0, 0), point),
    },
    {
      functionName: 'positionToPose',
      parameter: 'y',
      requirement: 'must be finite',
      run: (value) => positionToPose(pose(), vec(0, value, 0), point),
    },
    {
      functionName: 'positionToPose',
      parameter: 'z',
      requirement: 'must be finite',
      run: (value) => positionToPose(pose(), vec(0, 0, value), point),
    },
    {
      functionName: 'positionToPose',
      parameter: 'targetX',
      requirement: 'must be finite',
      run: (value) => positionToPose(pose(), point, vec(value, 0, 0)),
    },
    {
      functionName: 'positionToPose',
      parameter: 'targetY',
      requirement: 'must be finite',
      run: (value) => positionToPose(pose(), point, vec(0, value, 0)),
    },
    {
      functionName: 'positionToPose',
      parameter: 'targetZ',
      requirement: 'must be finite',
      run: (value) => positionToPose(pose(), point, vec(0, 0, value)),
    },
    {
      functionName: 'blendPose',
      parameter: 't',
      requirement: 'must be within [0, 1]',
      run: (value) => blendPose(pose(), pose(), pose(), value),
    },
  );

  for (const sample of finiteCases) {
    for (const value of NON_FINITE) {
      expectRangeError(
        () => sample.run(value),
        message(
          sample.functionName,
          sample.parameter,
          sample.requirement,
          value,
        ),
      );
    }
  }
});
