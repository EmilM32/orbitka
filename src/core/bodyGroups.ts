// Groups of the bodies list (SPEC §5.3) and the distance from the Sun shown
// next to each planet.

export const BODY_GROUP_ORDER = ['star', 'rocky', 'gas', 'ice'] as const;

export type BodyGroup = (typeof BODY_GROUP_ORDER)[number];

const GROUP_BY_ID: Readonly<Record<string, BodyGroup>> = {
  sun: 'star',
  mercury: 'rocky',
  venus: 'rocky',
  earth: 'rocky',
  mars: 'rocky',
  jupiter: 'gas',
  saturn: 'gas',
  uranus: 'ice',
  neptune: 'ice',
};

export function bodyGroup(id: string): BodyGroup {
  const group = Object.hasOwn(GROUP_BY_ID, id) ? GROUP_BY_ID[id] : undefined;
  if (group === undefined) {
    throw new RangeError(
      `bodyGroup: parameter "id" must be a known body id, got ${id}`,
    );
  }
  return group;
}

/** Semi-major axis in AU with two decimals: 0.38709927 → "0,39" in pl-PL. */
export function formatAu(au: number, locale: string): string {
  if (!Number.isFinite(au) || au <= 0) {
    throw new RangeError(
      `formatAu: parameter "au" must be a positive finite number, got ${au}`,
    );
  }
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(au);
}
