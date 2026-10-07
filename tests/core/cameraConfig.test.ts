import { expect, test } from 'vitest';

import { CAMERA_CONFIG } from '@core/cameraConfig.ts';

const UI_KEYS = [
  'labelFontPx',
  'labelMinContrast',
  'labelGapPx',
  'labelOffsetPx',
  'labelLayoutHz',
  'orbitsStorageKey',
  'tabletMaxWidthPx',
  'tabletMinWidthPx',
  'drawerWidthPx',
] as const;

test('holds the brief values', () => {
  expect(CAMERA_CONFIG.startPolarDeg).toBe(55);
  expect(CAMERA_CONFIG.startAzimuthDeg).toBe(0);
  expect(CAMERA_CONFIG.polarMinDeg).toBe(10);
  expect(CAMERA_CONFIG.polarMaxDeg).toBe(170);
  expect(CAMERA_CONFIG.startDistanceBase).toBe(Math.hypot(75, 95));
  expect(CAMERA_CONFIG.startDistanceAspect).toBe(1.2);
  expect(CAMERA_CONFIG.systemZoomMaxFactor).toBe(1.5);
  expect(CAMERA_CONFIG.systemZoomMinFactor).toBe(0.2);
  expect(CAMERA_CONFIG.bodyZoomMinRadiusFactor).toBe(2.5);
  expect(CAMERA_CONFIG.zoomStepIn).toBe(0.9);
  expect(CAMERA_CONFIG.zoomStepOut).toBe(1.1);
  expect(CAMERA_CONFIG.wheelNotchDeltaPx).toBe(100);
  expect(CAMERA_CONFIG.wheelNotchMinDeltaPx).toBe(50);
  expect(CAMERA_CONFIG.wheelGestureGapMs).toBe(150);
  expect(CAMERA_CONFIG.pinchDeltaPerStep).toBe(10);
  expect(CAMERA_CONFIG.dampingFactor).toBe(0.08);
  expect(CAMERA_CONFIG.dampingReferenceFps).toBe(60);
  expect(CAMERA_CONFIG.tapMaxMovePx).toBe(6);
  expect(CAMERA_CONFIG.tapMaxDurationMs).toBe(300);
  expect(CAMERA_CONFIG.hitRadiusMousePx).toBe(24);
  expect(CAMERA_CONFIG.hitRadiusTouchPx).toBe(44);
  expect(CAMERA_CONFIG.keyRotateStepDeg).toBe(5);
  expect(CAMERA_CONFIG.keyRotateStepShiftDeg).toBe(15);
  expect(CAMERA_CONFIG.flightToBodySeconds).toBe(1.2);
  expect(CAMERA_CONFIG.flightToSystemSeconds).toBe(1.0);
  expect(CAMERA_CONFIG.bodyDistanceRadiusFactor).toBe(6);
  expect(CAMERA_CONFIG.sunDistanceRadiusFactor).toBe(3.5);
  expect(CAMERA_CONFIG.reducedMotionFadeMs).toBe(150);
  expect(CAMERA_CONFIG.orbitOpacitySelected).toBe(0.8);
  expect(CAMERA_CONFIG.orbitOpacityDimmed).toBe(0.35);
  for (const key of UI_KEYS) {
    expect(CAMERA_CONFIG).not.toHaveProperty(key);
  }
});

test('is frozen at type level', () => {
  expect(Object.keys(CAMERA_CONFIG)).toEqual([
    'startPolarDeg',
    'startAzimuthDeg',
    'polarMinDeg',
    'polarMaxDeg',
    'startDistanceBase',
    'startDistanceAspect',
    'systemZoomMaxFactor',
    'systemZoomMinFactor',
    'bodyZoomMinRadiusFactor',
    'zoomStepIn',
    'zoomStepOut',
    'wheelNotchDeltaPx',
    'wheelNotchMinDeltaPx',
    'wheelGestureGapMs',
    'pinchDeltaPerStep',
    'dampingFactor',
    'dampingReferenceFps',
    'tapMaxMovePx',
    'tapMaxDurationMs',
    'hitRadiusMousePx',
    'hitRadiusTouchPx',
    'keyRotateStepDeg',
    'keyRotateStepShiftDeg',
    'flightToBodySeconds',
    'flightToSystemSeconds',
    'bodyDistanceRadiusFactor',
    'sunDistanceRadiusFactor',
    'reducedMotionFadeMs',
    'orbitOpacitySelected',
    'orbitOpacityDimmed',
  ]);
});
