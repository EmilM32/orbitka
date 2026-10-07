export const VIEWPORT = { width: 1280, height: 720 } as const;

export const DRAWN_BODY_IDS = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'moon',
  'mars',
  'jupiter',
  'io',
  'europa',
  'ganymede',
  'callisto',
  'saturn',
  'uranus',
  'neptune',
] as const;

export const MOON_IDS = [
  'moon',
  'io',
  'europa',
  'ganymede',
  'callisto',
] as const;

// Kepler position at t = 0 (J2000 elements, Newton) on a 1280×720 frame.
// Ecliptic (x, y, north z) is scaled by 8·AU^0.5, then mapped to scene
// (x, north y, −y). Camera: polar 55°, azimuth 0°, distance hypot(75, 95),
// FOV 45°, looking at the origin. Screen x = (ndcX·0.5+0.5)·1280,
// y = (−ndcY·0.5+0.5)·720, rounded to 0.1 px. Constants, not a mesh readout.
export const GOLDEN_SCREEN = {
  mercury: { x: 628.7, y: 384.1 },
  earth: { x: 630.3, y: 329.5 },
  neptune: { x: 873.7, y: 557.9 },
} as const;

// visual.color from src/data/bodies.json, copied: e2e imports nothing from src.
export const BODY_COLORS = {
  sun: '#FDB813',
  mercury: '#9C9C9C',
  venus: '#E6C88A',
  earth: '#3A78C2',
  moon: '#B8B8B8',
  mars: '#C1440E',
  jupiter: '#D2A679',
  io: '#E8D26A',
  europa: '#D9C9A8',
  ganymede: '#9A8F80',
  callisto: '#5E5245',
  saturn: '#E3CC8F',
  uranus: '#7FD6E0',
  neptune: '#3F5FD0',
} as const satisfies Record<(typeof DRAWN_BODY_IDS)[number], string>;

// Bodies the pixel check skips, each with a reason. At the whole-system view
// (days=0, 1280×720) every moon is at most a few pixels: the Galilean moons
// sit on Jupiter's disc and its debug axes and are close to Jupiter in color,
// and the Moon covers about 3 pixels next to Earth. Their positions are
// covered by tests/render/animateMoons.test.ts and moons.spec.ts.
export const UNPROBED_BODY_IDS: readonly string[] = MOON_IDS;

// Pixel thresholds for the body check, measured in SwiftShader at days=0.
export const PIXEL = {
  // Orbit lines (0x5b6b8c at opacity 0.55 on black) peak at 77 in any
  // channel. A pixel at or above this value is a body or a debug axis.
  brightMin: 96,
  // A body pixel must be at least this bright in its strongest channel.
  // Black background and unlit bodies stay below it.
  litMin: 30,
  // Largest distance between linear-light chromaticities of a pixel and the
  // body color. Orbit lines are at least 0.15 away from every body.
  chromaTolerance: 0.06,
  // The window around the body center: (2r + 1)² pixels.
  windowRadius: 4,
  // Fewest matching pixels per body. Mercury, the smallest, has 15.
  minMatches: 3,
} as const;

// Share of pixels brighter than the orbit lines. The Sun alone covers about
// 0.18% of the frame and all bodies about 0.24%; orbit lines alone give 0.
export const MIN_BRIGHT_FILL = 0.0012;
