import { expect, test } from 'vitest';

import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import {
  classifyWheel,
  createWheelGestureState,
  dragToRotation,
  isTap,
  wheelZoomFactor,
  type WheelKind,
  type WheelSample,
} from '@core/pointerGestures.ts';

function sample(
  deltaY: number,
  extras: Partial<WheelSample> = {},
): WheelSample {
  return {
    deltaX: 0,
    deltaY,
    deltaMode: 0,
    ctrlKey: false,
    ...extras,
  };
}

function play(
  events: readonly { at: number; sample: WheelSample }[],
): WheelKind[] {
  const state = createWheelGestureState();
  return events.map((event) => classifyWheel(state, event.sample, event.at));
}

test('pointerGestures › isTap', () => {
  expect(isTap(5.9, 299)).toBe(true);
  expect(isTap(6, 100)).toBe(false);
  expect(isTap(2, 300)).toBe(false);
  expect(isTap(0, 0)).toBe(true);
});

test('pointerGestures › drag rotation and wheel zoom factor', () => {
  const rotation = dragToRotation({ dAzimuth: 1, dPolar: 1 }, 100, 100, 720);
  const expected = (-2 * Math.PI * 100) / 720;
  expect(rotation.dAzimuth).toBeCloseTo(expected, 12);
  expect(rotation.dPolar).toBeCloseTo(expected, 12);

  expect(wheelZoomFactor('notch', sample(100))).toBe(CAMERA_CONFIG.zoomStepOut);
  expect(wheelZoomFactor('notch', sample(-100))).toBe(CAMERA_CONFIG.zoomStepIn);
  expect(wheelZoomFactor('notch', sample(3, { deltaMode: 1 }))).toBe(
    CAMERA_CONFIG.zoomStepOut,
  );
  expect(wheelZoomFactor('notch', sample(-3, { deltaMode: 1 }))).toBe(
    CAMERA_CONFIG.zoomStepIn,
  );

  expect(wheelZoomFactor('pinch', sample(10))).toBeCloseTo(1.1, 12);
  expect(wheelZoomFactor('pinch', sample(25))).toBeCloseTo(1.1 ** 2.5, 12);
  expect(wheelZoomFactor('pinch', sample(1_000))).toBeCloseTo(1.1 ** 5, 12);
  expect(wheelZoomFactor('pinch', sample(-80))).toBeCloseTo(1.1 ** -5, 12);
  expect(wheelZoomFactor('trackpad', sample(60))).toBe(1);
});

test('pointerGestures › classifyWheel recorded sequences', () => {
  const mouse = play([
    { at: 0, sample: sample(100) },
    { at: 16, sample: sample(-100) },
    { at: 32, sample: sample(100) },
  ]);
  expect(mouse).toEqual(['notch', 'notch', 'notch']);

  const trackpad = play([
    { at: 0, sample: sample(0.4, { deltaX: 0.1 }) },
    { at: 8, sample: sample(3.2, { deltaX: -0.2 }) },
    { at: 16, sample: sample(12.5, { deltaX: 0.4 }) },
    { at: 24, sample: sample(60) },
    { at: 32, sample: sample(8.2, { deltaX: 0.1 }) },
    { at: 40, sample: sample(1.5) },
    { at: 48, sample: sample(2) },
  ]);
  expect(trackpad).toEqual([
    'trackpad',
    'trackpad',
    'trackpad',
    'trackpad',
    'trackpad',
    'trackpad',
    'trackpad',
  ]);

  // Inertial two-finger scroll with whole-number deltas: small values first.
  const smallIntegerRamp = play(
    [1, 2, 4, 8, 16, 32, 64, 48, 24].map((deltaY, index) => ({
      at: index * 8,
      sample: sample(deltaY),
    })),
  );
  expect(smallIntegerRamp).toEqual(Array(9).fill('trackpad'));

  const smallIntegersOnly = play(
    [2, 4, 6, 4, 2].map((deltaY, index) => ({
      at: index * 8,
      sample: sample(deltaY),
    })),
  );
  expect(smallIntegersOnly).toEqual(Array(5).fill('trackpad'));

  const firefox = play([
    { at: 0, sample: sample(3, { deltaMode: 1 }) },
    { at: 20, sample: sample(-3, { deltaMode: 1 }) },
  ]);
  expect(firefox).toEqual(['notch', 'notch']);

  const pinch = play([
    { at: 0, sample: sample(100, { ctrlKey: true }) },
    { at: 12, sample: sample(-4.5, { deltaX: 1.2, ctrlKey: true }) },
  ]);
  expect(pinch).toEqual(['pinch', 'pinch']);

  const reset = play([
    { at: 0, sample: sample(0.5, { deltaX: 0.25 }) },
    { at: 149, sample: sample(100) },
    { at: 149 + CAMERA_CONFIG.wheelGestureGapMs, sample: sample(100) },
  ]);
  expect(reset).toEqual(['trackpad', 'trackpad', 'notch']);

  expect(() =>
    classifyWheel(createWheelGestureState(), sample(Number.NaN), 0),
  ).toThrow(RangeError);
  expect(() =>
    classifyWheel(createWheelGestureState(), sample(Number.NaN), 0),
  ).toThrow('classifyWheel: parameter "deltaY" must be finite, got NaN');
});

test('pointerGestures › accepts plain objects', () => {
  expect(typeof globalThis.window).toBe('undefined');
  const plain = { deltaX: 0, deltaY: -100, deltaMode: 0, ctrlKey: false };
  const state = createWheelGestureState();
  expect(classifyWheel(state, plain, 0)).toBe('notch');
  expect(wheelZoomFactor('notch', plain)).toBe(0.9);
  const out = { dAzimuth: 0, dPolar: 0 };
  expect(dragToRotation(out, 0, 10, 100)).toBe(out);
});
