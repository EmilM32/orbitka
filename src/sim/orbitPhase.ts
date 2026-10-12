import type { BodyDef } from '@data/types.ts';

/**
 * Where a body is along its orbit, as a fraction of one revolution in mean
 * anomaly: 0 at the start of the orbit line, rising in the direction of
 * motion, wrapping from just below 1 back to 0. Mean anomaly is the same
 * parameter `bodyPositionAu` and the orbit line points are built from, so the
 * fraction of line point `k` of `n` is `k / n`. No allocation.
 */
export function orbitPhase(def: BodyDef, daysSinceJ2000: number): number {
  const orbit = def.orbit;
  if (orbit === undefined) {
    throw new RangeError(`orbitPhase: body "${def.id}" has no orbit`);
  }
  if (!Number.isFinite(orbit.periodDays) || orbit.periodDays <= 0) {
    throw new RangeError(
      `orbitPhase: body "${def.id}" orbit.periodDays must be finite and > 0, got ${orbit.periodDays}`,
    );
  }
  if (!Number.isFinite(orbit.meanAnomalyAtEpochDeg)) {
    throw new RangeError(
      `orbitPhase: body "${def.id}" orbit.meanAnomalyAtEpochDeg must be finite, got ${orbit.meanAnomalyAtEpochDeg}`,
    );
  }
  if (!Number.isFinite(daysSinceJ2000)) {
    throw new RangeError(
      `orbitPhase: parameter "daysSinceJ2000" must be finite, got ${daysSinceJ2000}`,
    );
  }

  const turns =
    orbit.meanAnomalyAtEpochDeg / 360 + daysSinceJ2000 / orbit.periodDays;
  const fraction = turns - Math.floor(turns);
  // A tiny negative turn count can round up to exactly 1.
  return fraction >= 1 ? 0 : fraction;
}
