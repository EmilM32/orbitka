// Numeric facts for the body card (SPEC §5.5, §5.7, §12). Every number comes
// from bodies.json, so the card never carries a hand-typed value.

export const EARTH_RADIUS_KM = 6371.0;

// An orbital period shorter than this many Earth years is shown in days.
export const YEAR_IN_DAYS_BELOW = 1;
// A rotation period shorter than this many hours is shown as hours and minutes.
export const DAY_IN_HOURS_BELOW = 48;

/** Structural body row; `BodyDef` from `@data` fits it. */
export type FactsBody = {
  type: string;
  radiusKm: number;
  rotation: { periodHours: number };
  orbit?: { periodDays: number };
};

export type BodyFacts = {
  diameterVsEarth: number;
  yearEarthYears: number | null;
  dayHours: number;
};

export type DiameterGauge = { bodyFraction: number; earthFraction: number };

export type RoundedRatio = {
  value: number;
  approximate: boolean;
  inverse: number | null;
};

function invalidInput(
  functionName: string,
  parameter: string,
  requirement: string,
  value: unknown,
): RangeError {
  return new RangeError(
    `${functionName}: parameter "${parameter}" ${requirement}, got ${String(value)}`,
  );
}

function requirePositive(
  functionName: string,
  parameter: string,
  value: unknown,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw invalidInput(
      functionName,
      parameter,
      'must be a finite number > 0',
      value,
    );
  }
  return value;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

// Rounds to 1 / factor without the float noise of roundTo (0.38, not 0.38000000000000006).
function roundDecimals(value: number, factor: number): number {
  return Math.round(value * factor) / factor;
}

export function computeBodyFacts(body: FactsBody, earth: FactsBody): BodyFacts {
  const fn = 'computeBodyFacts';
  const radiusKm = requirePositive(fn, 'body.radiusKm', body.radiusKm);
  const earthRadiusKm = requirePositive(fn, 'earth.radiusKm', earth.radiusKm);
  const dayHours = requirePositive(
    fn,
    'body.rotation.periodHours',
    body.rotation.periodHours,
  );
  const earthYearDays = requirePositive(
    fn,
    'earth.orbit.periodDays',
    earth.orbit?.periodDays,
  );

  let yearEarthYears: number | null = null;
  if (body.type !== 'star' && body.type !== 'moon') {
    if (body.orbit === undefined) {
      throw invalidInput(
        fn,
        'body.orbit',
        `must be present for type ${body.type}`,
        body.orbit,
      );
    }
    const periodDays = requirePositive(
      fn,
      'body.orbit.periodDays',
      body.orbit.periodDays,
    );
    yearEarthYears = periodDays / earthYearDays;
  }

  return {
    diameterVsEarth: radiusKm / earthRadiusKm,
    yearEarthYears,
    dayHours,
  };
}

/** Bar widths on one shared scale: the larger diameter fills the gauge. */
export function diameterGauge(k: number): DiameterGauge {
  requirePositive('diameterGauge', 'k', k);
  if (k >= 1) {
    return { bodyFraction: 1, earthFraction: 1 / k };
  }
  return { bodyFraction: k, earthFraction: 1 };
}

export function roundRatio(k: number): RoundedRatio {
  requirePositive('roundRatio', 'k', k);
  if (k >= 10) {
    return { value: Math.round(k), approximate: true, inverse: null };
  }
  if (k >= 1) {
    return { value: roundDecimals(k, 10), approximate: false, inverse: null };
  }
  return {
    value: roundDecimals(k, 100),
    approximate: false,
    inverse: roundDecimals(1 / k, 10),
  };
}

export function roundKm(km: number): number {
  if (!Number.isFinite(km) || km < 0) {
    throw invalidInput('roundKm', 'km', 'must be a finite number >= 0', km);
  }
  return roundTo(km, 100);
}

export function splitHours(hours: number): { hours: number; minutes: number } {
  requirePositive('splitHours', 'hours', hours);
  const totalMinutes = Math.round(hours * 60);
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}
