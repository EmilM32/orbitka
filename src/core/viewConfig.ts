/** UI and layout constants. Camera numbers live in `cameraConfig.ts`. */
export const VIEW_CONFIG = {
  labelFontPx: 13,
  labelHeightPx: 24,
  moonLabelHeightPx: 26,
  moonLabelFontPx: 14,
  labelLeaderOffsetPx: 24,
  labelMinContrast: 4.5,
  labelGapPx: 4,
  labelOffsetPx: 6,
  labelLayoutHz: 10,
  orbitsStorageKey: 'orbitka.orbits',
  tabletMaxWidthPx: 1024,
  tabletMinWidthPx: 768,
  drawerWidthPx: 300,
  railMaxWidthPx: 1440,
  selectionRingPaddingPx: 8,
  selectionRingMinRadiusPx: 12,
} as const;
