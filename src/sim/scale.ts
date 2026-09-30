// Uproszczona skala sceny (ADR-004). Wszystkie stałe do strojenia są w SCALE.
export const SCALE = {
  k: 8, // mnożnik odległości: d = k · AU^0.5
  c: 0.015, // mnożnik rozmiaru: r = c · radiusKm^0.4
  radiusMin: 0.25, // dolne ograniczenie promienia ciała w scenie
  radiusMax: 3.4, // górne ograniczenie; musi być mniejsze niż peryhelium Merkurego (4.44) − 1.0
  moonOrbitBase: 1.5, // najmniejsza odległość księżyca = base · promień planety w scenie
  moonOrbitFactor: 0.03, // współczynnik przy (odległość / promień planety)^exponent
  moonOrbitExponent: 0.7, // wykładnik odległości księżyca od planety
  moonRadiusC: 0.008, // mnożnik rozmiaru księżyca: r = C · radiusKm^0.4
  moonRadiusMin: 0.05, // dolne ograniczenie promienia księżyca w scenie
  moonRadiusMax: 0.4, // górne ograniczenie promienia księżyca w scenie
} as const;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function distanceToScene(au: number): number {
  return au > 0 ? SCALE.k * Math.sqrt(au) : 0;
}

export function radiusToScene(km: number): number {
  return km > 0
    ? clamp(SCALE.c * km ** 0.4, SCALE.radiusMin, SCALE.radiusMax)
    : SCALE.radiusMin;
}

export function moonDistanceToScene(
  distanceKm: number,
  parentRadiusKm: number,
): number {
  if (distanceKm <= 0) {
    return 0;
  }

  const spread =
    SCALE.moonOrbitFactor *
    (distanceKm / parentRadiusKm) ** SCALE.moonOrbitExponent;
  return radiusToScene(parentRadiusKm) * (SCALE.moonOrbitBase + spread);
}

export function moonRadiusToScene(km: number): number {
  return km > 0
    ? clamp(
        SCALE.moonRadiusC * km ** 0.4,
        SCALE.moonRadiusMin,
        SCALE.moonRadiusMax,
      )
    : SCALE.moonRadiusMin;
}

// Zachowuje kierunek wektora, a jego długość zamienia na distanceToScene(|r|).
// Zapisuje wynik do out, żeby w pętli renderowania nie tworzyć nowych obiektów.
export function compressPositionAu(
  x: number,
  y: number,
  z: number,
  out: Vec3,
): Vec3 {
  const lengthAu = Math.sqrt(x * x + y * y + z * z);
  const factor = lengthAu > 0 ? distanceToScene(lengthAu) / lengthAu : 0;

  out.x = x * factor;
  out.y = y * factor;
  out.z = z * factor;
  return out;
}
