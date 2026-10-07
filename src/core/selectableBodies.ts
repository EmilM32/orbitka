export type SelectableBodyType = 'star' | 'planet';

export type SelectableBody = {
  id: string;
  type: SelectableBodyType;
  radiusKm: number;
};

/** Structural body row. Moons, dwarfs, and belts are ignored. */
export type SelectableBodySource = {
  id: string;
  type: string;
  radiusKm: number;
  orbit?: {
    semiMajorAxisAu?: number;
    semiMajorAxisKm?: number;
  };
};

type RankedBody = SelectableBody & { axisAu: number };

export function getSelectableBodies(
  defs: readonly SelectableBodySource[],
): SelectableBody[] {
  const ranked: RankedBody[] = [];
  for (let index = 0; index < defs.length; index += 1) {
    const body = defs[index];
    if (
      body === undefined ||
      (body.type !== 'star' && body.type !== 'planet')
    ) {
      continue;
    }
    ranked.push({
      id: body.id,
      type: body.type,
      radiusKm: body.radiusKm,
      axisAu: body.type === 'star' ? 0 : axisAu(body),
    });
  }

  ranked.sort((left, right) => compareAxis(left.axisAu, right.axisAu));

  const bodies: SelectableBody[] = [];
  for (let index = 0; index < ranked.length; index += 1) {
    const body = ranked[index];
    if (body === undefined) {
      continue;
    }
    bodies.push({
      id: body.id,
      type: body.type,
      radiusKm: body.radiusKm,
    });
  }
  return bodies;
}

function compareAxis(left: number, right: number): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function axisAu(body: SelectableBodySource): number {
  const axis = body.orbit?.semiMajorAxisAu;
  if (typeof axis === 'number' && Number.isFinite(axis)) {
    return axis;
  }
  return Number.POSITIVE_INFINITY;
}
