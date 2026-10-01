export const VIEWPORT = { width: 1280, height: 720 } as const;

export const DRAWN_BODY_IDS = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
] as const;

// Kepler position at t = 0 projected onto a 1280×720 frame. Constants, not a mesh readout.
export const GOLDEN_SCREEN = {
  mercury: { x: 628.7, y: 385.8 },
  earth: { x: 630.2, y: 327.0 },
  neptune: { x: 870.6, y: 571.1 },
} as const;

export const MIN_FILL = 0.0015;
