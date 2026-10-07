import { expect, test } from 'vitest';

import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import {
  cancelFlight,
  computeGoalPose,
  createFlight,
  isFlightActive,
  startFlight,
  stepFlight,
  type CameraFlight,
} from '@core/cameraFlight.ts';
import { startDistance, type CameraPose } from '@core/cameraMath.ts';

const DEG = Math.PI / 180;
const FRAME_SECONDS = 1 / 60;

function pose(
  azimuth = 0.4,
  polar = 1.1,
  distance = 40,
  targetX = 3,
  targetY = 4,
  targetZ = 5,
): CameraPose {
  return { azimuth, polar, distance, targetX, targetY, targetZ };
}

function blank(): CameraPose {
  return {
    azimuth: 0,
    polar: 0,
    distance: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  };
}

function framesUntilDone(flight: CameraFlight): number {
  let frames = 0;
  while (isFlightActive(flight)) {
    stepFlight(flight, FRAME_SECONDS);
    frames += 1;
    if (frames > 240) {
      break;
    }
  }
  return frames;
}

test('durations 1.2 and 1.0', () => {
  const flight = createFlight();
  const fromSlot = flight.from;
  const from = pose();
  startFlight(flight, from, 'body', CAMERA_CONFIG.flightToBodySeconds);
  expect(flight.from).toBe(fromSlot);
  expect(flight.from.azimuth).toBe(from.azimuth);
  expect(flight.from.polar).toBe(from.polar);
  expect(flight.from.distance).toBe(from.distance);
  expect(framesUntilDone(flight)).toBe(72);
  expect(isFlightActive(flight)).toBe(false);

  startFlight(
    flight,
    flight.from,
    'system',
    CAMERA_CONFIG.flightToSystemSeconds,
  );
  expect(flight.from).toBe(fromSlot);
  expect(flight.from.azimuth).toBe(from.azimuth);
  expect(flight.kind).toBe('system');
  expect(framesUntilDone(flight)).toBe(60);

  startFlight(flight, from, 'body', CAMERA_CONFIG.flightToBodySeconds);
  cancelFlight(flight);
  expect(isFlightActive(flight)).toBe(false);
  expect(stepFlight(flight, FRAME_SECONDS)).toBe(0);
});

test('eased fraction at half time', () => {
  const flight = createFlight();
  startFlight(flight, pose(), 'body', CAMERA_CONFIG.flightToBodySeconds);
  const bodyFraction = stepFlight(
    flight,
    CAMERA_CONFIG.flightToBodySeconds / 2,
  );
  expect(bodyFraction).toBeCloseTo(0.5, 9);
  expect(isFlightActive(flight)).toBe(true);

  startFlight(flight, pose(), 'system', CAMERA_CONFIG.flightToSystemSeconds);
  const systemFraction = stepFlight(
    flight,
    CAMERA_CONFIG.flightToSystemSeconds / 2,
  );
  expect(systemFraction).toBeCloseTo(0.5, 9);
});

test('computeGoalPose body', () => {
  const current = pose(0.7, 0.9, 80, 1, 2, 3);
  const out = blank();
  computeGoalPose(out, 'body', 8, -2, 6, 2, false, current, 16 / 9);
  expect(out.distance).toBe(2 * CAMERA_CONFIG.bodyDistanceRadiusFactor);
  expect(out.azimuth).toBe(current.azimuth);
  expect(out.polar).toBe(current.polar);
  expect(out.targetX).toBe(8);
  expect(out.targetY).toBe(-2);
  expect(out.targetZ).toBe(6);
  expect(current.azimuth).toBe(0.7);

  computeGoalPose(out, 'body', 1, 0, -3, 4, true, current, 9 / 16);
  expect(out.distance).toBe(4 * CAMERA_CONFIG.sunDistanceRadiusFactor);
  expect(out.azimuth).toBe(current.azimuth);
  expect(out.polar).toBe(current.polar);
  expect(out.targetX).toBe(1);
  expect(out.targetY).toBe(0);
  expect(out.targetZ).toBe(-3);

  const below = pose(0.2, 0, 10, 0, 0, 0);
  computeGoalPose(out, 'body', 0, 0, 0, 1, false, below, 1);
  expect(out.polar).toBeCloseTo(CAMERA_CONFIG.polarMinDeg * DEG, 12);
  expect(out.azimuth).toBe(below.azimuth);
  expect(below.polar).toBe(0);
});

test('computeGoalPose system', () => {
  const current = pose(1.2, 0.4, 50, 9, 8, 7);
  const out = blank();
  const aspects = [16 / 9, 9 / 16];
  for (let index = 0; index < aspects.length; index += 1) {
    const aspect = aspects[index];
    if (aspect === undefined) {
      continue;
    }
    computeGoalPose(out, 'system', 4, 5, 6, 0, false, current, aspect);
    expect(out.targetX).toBe(0);
    expect(out.targetY).toBe(0);
    expect(out.targetZ).toBe(0);
    expect(out.distance).toBe(startDistance(aspect));
    expect(out.polar).toBeCloseTo(CAMERA_CONFIG.startPolarDeg * DEG, 12);
    expect(out.azimuth).toBe(current.azimuth);
  }
  expect(current.targetX).toBe(9);
});

test('invalid input', () => {
  const flight = createFlight();
  const from = pose();
  expect(() => startFlight(flight, from, 'body', -1)).toThrow(RangeError);
  expect(() => startFlight(flight, from, 'body', -1)).toThrow(
    'startFlight: parameter "durationSeconds" must be finite and >= 0, got -1',
  );
  expect(flight.kind).toBe('none');

  startFlight(flight, from, 'body', CAMERA_CONFIG.flightToBodySeconds);
  expect(() => stepFlight(flight, Number.NaN)).toThrow(RangeError);
  expect(() => stepFlight(flight, Number.NaN)).toThrow(
    'stepFlight: parameter "dtSeconds" must be finite and >= 0, got NaN',
  );
  expect(() => stepFlight(flight, -1)).toThrow(
    'stepFlight: parameter "dtSeconds" must be finite and >= 0, got -1',
  );
  expect(flight.elapsed).toBe(0);

  const out = blank();
  expect(() =>
    computeGoalPose(out, 'body', 0, 0, 0, 0, false, from, 1),
  ).toThrow(RangeError);
  expect(() =>
    computeGoalPose(out, 'body', 0, 0, 0, 0, false, from, 1),
  ).toThrow(
    'computeGoalPose: parameter "displayRadius" must be finite and > 0, got 0',
  );
  expect(() =>
    computeGoalPose(out, 'body', 0, 0, 0, -2, true, from, 1),
  ).toThrow(
    'computeGoalPose: parameter "displayRadius" must be finite and > 0, got -2',
  );
  expect(out.distance).toBe(0);
});
