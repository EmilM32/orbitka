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
  // A label beside its body moves back above or below only with this much
  // room to spare, so it does not flip back and forth at the boundary.
  labelSideHysteresisPx: 8,
  // ...and only after it has kept its side this many layouts (3 s at 10 Hz).
  labelSideHoldLayouts: 30,
  // A body that moved further than this since the last layout (camera
  // flight, fast time) gets a fresh side instead of keeping the old one.
  labelKeepMaxMovePx: 24,
  orbitsStorageKey: 'orbitka.orbits',
  tabletMaxWidthPx: 1024,
  tabletMinWidthPx: 768,
  drawerWidthPx: 300,
  railMaxWidthPx: 1440,
  selectionRingPaddingPx: 8,
  selectionRingMinRadiusPx: 12,
} as const;
