import { expect, test } from 'vitest';

import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import { VIEW_CONFIG } from '@core/viewConfig.ts';

const CAMERA_KEYS = [
  'startPolarDeg',
  'startAzimuthDeg',
  'polarMinDeg',
  'polarMaxDeg',
  'startDistanceBase',
  'dampingFactor',
  'wheelNotchMinDeltaPx',
  'wheelGestureGapMs',
  'hitRadiusMousePx',
  'hitRadiusTouchPx',
  'flightToBodySeconds',
  'flightToSystemSeconds',
  'orbitOpacitySelected',
  'orbitOpacityDimmed',
] as const;

const UI_KEYS = [
  'labelFontPx',
  'labelHeightPx',
  'labelMinContrast',
  'labelGapPx',
  'labelOffsetPx',
  'labelLayoutHz',
  'orbitsStorageKey',
  'tabletMaxWidthPx',
  'tabletMinWidthPx',
  'drawerWidthPx',
  'selectionRingPaddingPx',
  'selectionRingMinRadiusPx',
] as const;

test('holds the brief values', () => {
  expect(VIEW_CONFIG.labelFontPx).toBe(13);
  expect(VIEW_CONFIG.labelHeightPx).toBe(24);
  expect(VIEW_CONFIG.labelMinContrast).toBe(4.5);
  expect(VIEW_CONFIG.labelGapPx).toBe(4);
  expect(VIEW_CONFIG.labelOffsetPx).toBe(6);
  expect(VIEW_CONFIG.labelLayoutHz).toBe(10);
  expect(VIEW_CONFIG.orbitsStorageKey).toBe('orbitka.orbits');
  expect(VIEW_CONFIG.tabletMaxWidthPx).toBe(1024);
  expect(VIEW_CONFIG.tabletMinWidthPx).toBe(768);
  expect(VIEW_CONFIG.drawerWidthPx).toBe(280);
  expect(VIEW_CONFIG.selectionRingPaddingPx).toBe(4);
  expect(VIEW_CONFIG.selectionRingMinRadiusPx).toBe(12);

  expect(Object.keys(VIEW_CONFIG)).toEqual([
    'labelFontPx',
    'labelHeightPx',
    'labelMinContrast',
    'labelGapPx',
    'labelOffsetPx',
    'labelLayoutHz',
    'orbitsStorageKey',
    'tabletMaxWidthPx',
    'tabletMinWidthPx',
    'drawerWidthPx',
    'selectionRingPaddingPx',
    'selectionRingMinRadiusPx',
  ]);

  for (const key of CAMERA_KEYS) {
    expect(VIEW_CONFIG).not.toHaveProperty(key);
  }
  for (const key of UI_KEYS) {
    expect(CAMERA_CONFIG).not.toHaveProperty(key);
  }
});
