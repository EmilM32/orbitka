export type BodyType = 'star' | 'planet' | 'dwarf' | 'moon' | 'belt';

interface OrbitElements {
  eccentricity: number;
  inclinationDeg: number; // relative to the J2000 ecliptic (planets)
  longitudeAscendingNodeDeg: number; // Ω
  argumentPeriapsisDeg: number; // ω = ϖ − Ω
  meanAnomalyAtEpochDeg: number; // M0 = L − ϖ
  epoch: 'J2000';
  periodDays: number;
}

// An orbit around the Sun (planet, dwarf planet, belt).
export interface HelioOrbitDef extends OrbitElements {
  semiMajorAxisAu: number;
}

// A moon's orbit around its parent planet. The axis is in kilometers.
export interface MoonOrbitDef extends OrbitElements {
  semiMajorAxisKm: number;
}

export type OrbitDef = HelioOrbitDef | MoonOrbitDef;

export interface RotationDef {
  periodHours: number;
  axialTiltDeg: number;
}

// Ring radii are measured from the body's center (NASA Saturnian Rings Fact
// Sheet). `texture: null` means the band profile is generated in code.
export interface RingDef {
  texture: string | null;
  innerRadiusKm: number;
  outerRadiusKm: number;
}

export interface VisualDef {
  texture: string | null;
  ring?: RingDef;
  color: string;
}

interface BodyBase {
  id: string;
  name: string;
  parentId: string | null;
  radiusKm: number;
  mass?: number; // 10^24 kg
  rotation: RotationDef;
  visual: VisualDef;
  contentKey: string;
}

export interface MoonDef extends BodyBase {
  type: 'moon';
  orbit?: MoonOrbitDef;
}

export interface HelioBodyDef extends BodyBase {
  type: Exclude<BodyType, 'moon'>;
  orbit?: HelioOrbitDef;
}

export type BodyDef = MoonDef | HelioBodyDef;

export type ValidationResult =
  { ok: true; bodies: BodyDef[] } | { ok: false; errors: string[] };
