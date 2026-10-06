// JPL Table 1 is stated for the years 1800–2050. These bounds are UTC
// midnights in days since J2000 (2000-01-01 12:00 UTC), the same subtraction
// as daysFromDate. 1800-01-01 00:00 UTC is inside. 2051-01-01 00:00 UTC is
// the exclusive end. This file is the only copy of the two numbers.

export const ELEMENT_VALID_FROM_DAYS = -73048.5;
export const ELEMENT_VALID_UNTIL_DAYS = 18627.5;

export function orbitalElementsAreApproximate(daysSinceJ2000: number): boolean {
  if (!Number.isFinite(daysSinceJ2000)) {
    throw new RangeError(
      `orbitalElementsAreApproximate: parameter "daysSinceJ2000" must be finite, got ${daysSinceJ2000}`,
    );
  }

  return (
    daysSinceJ2000 < ELEMENT_VALID_FROM_DAYS ||
    daysSinceJ2000 >= ELEMENT_VALID_UNTIL_DAYS
  );
}
