export type BodyType = 'star' | 'planet' | 'dwarf' | 'moon' | 'belt';

export interface OrbitDef {
  semiMajorAxisAu: number; // AU; for moons (type 'moon') in km. Field name follows ADR-003
  eccentricity: number;
  inclinationDeg: number; // relative to the J2000 ecliptic (planets)
  longitudeAscendingNodeDeg: number; // Ω
  argumentPeriapsisDeg: number; // ω = ϖ − Ω
  meanAnomalyAtEpochDeg: number; // M0 = L − ϖ
  epoch: 'J2000';
  periodDays: number;
}

export interface RotationDef {
  periodHours: number;
  axialTiltDeg: number;
}

export interface VisualDef {
  texture: string | null;
  ringTexture?: string;
  color: string;
}

export interface BodyDef {
  id: string;
  name: string;
  type: BodyType;
  parentId: string | null;
  radiusKm: number;
  mass?: number; // 10^24 kg
  orbit?: OrbitDef;
  rotation: RotationDef;
  visual: VisualDef;
  contentKey: string;
}

export type ValidationResult =
  { ok: true; bodies: BodyDef[] } | { ok: false; errors: string[] };
