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

function invalidInput(
  functionName: string,
  parameter: string,
  requirement: string,
  value: number,
): RangeError {
  return new RangeError(
    `${functionName}: parametr „${parameter}” ${requirement}, otrzymano ${value}`,
  );
}

function requireFinite(
  functionName: string,
  parameter: string,
  value: number,
): void {
  if (!Number.isFinite(value)) {
    throw invalidInput(functionName, parameter, 'musi być skończony', value);
  }
}

// Kwadrat składnika przepełnia się wcześniej niż Math.hypot (około 1e154).
function requirePositionComponent(parameter: string, value: number): void {
  if (!Number.isFinite(value) || !Number.isFinite(value * value)) {
    throw invalidInput(
      'compressPositionAu',
      parameter,
      'musi być skończony i nie przepełniać się',
      value,
    );
  }
}

export function distanceToScene(au: number): number {
  requireFinite('distanceToScene', 'au', au);
  return au > 0 ? SCALE.k * Math.sqrt(au) : 0;
}

export function radiusToScene(km: number): number {
  requireFinite('radiusToScene', 'km', km);
  return km > 0
    ? clamp(SCALE.c * km ** 0.4, SCALE.radiusMin, SCALE.radiusMax)
    : SCALE.radiusMin;
}

export function moonDistanceToScene(
  distanceKm: number,
  parentRadiusKm: number,
): number {
  requireFinite('moonDistanceToScene', 'distanceKm', distanceKm);
  if (!Number.isFinite(parentRadiusKm) || parentRadiusKm <= 0) {
    throw invalidInput(
      'moonDistanceToScene',
      'parentRadiusKm',
      'musi być skończony i > 0',
      parentRadiusKm,
    );
  }

  if (distanceKm <= 0) {
    return 0;
  }

  const spread =
    SCALE.moonOrbitFactor *
    (distanceKm / parentRadiusKm) ** SCALE.moonOrbitExponent;
  return radiusToScene(parentRadiusKm) * (SCALE.moonOrbitBase + spread);
}

export function moonRadiusToScene(km: number): number {
  requireFinite('moonRadiusToScene', 'km', km);
  return km > 0
    ? clamp(
        SCALE.moonRadiusC * km ** 0.4,
        SCALE.moonRadiusMin,
        SCALE.moonRadiusMax,
      )
    : SCALE.moonRadiusMin;
}

// Zachowuje kierunek wektora, a jego długość zamienia na distanceToScene(|r|).
// Długość liczy Math.hypot, bez x*x, które przepełnia się albo zeruje kierunek.
// Zapisuje wynik do out, żeby w pętli renderowania nie tworzyć nowych obiektów.
export function compressPositionAu(
  x: number,
  y: number,
  z: number,
  out: Vec3,
): Vec3 {
  requirePositionComponent('x', x);
  requirePositionComponent('y', y);
  requirePositionComponent('z', z);

  const lengthAu = Math.hypot(x, y, z);
  const factor = lengthAu > 0 ? distanceToScene(lengthAu) / lengthAu : 0;

  out.x = x * factor;
  out.y = y * factor;
  out.z = z * factor;
  return out;
}
