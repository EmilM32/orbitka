import type { BodyDef, BodyType, ValidationResult } from './types.ts';

type Fields = Record<string, unknown>;

// Returns a problem description, or null when the value is valid.
type Rule = (value: unknown) => string | null;

const BODY_TYPES: readonly BodyType[] = [
  'star',
  'planet',
  'dwarf',
  'moon',
  'belt',
];
const ID_PATTERN = /^[a-z0-9-]+$/;
// Moons store the semi-major axis in kilometers. Every other orbit uses AU.
// Neptune is about 30 AU and the Moon is about 384400 km, so 1000 separates them.
const MOON_AXIS_MIN_KM = 1000;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const anyNumber: Rule = (value) =>
  isFiniteNumber(value) ? null : 'must be a number';

function numberWhere(test: (value: number) => boolean, problem: string): Rule {
  return (value) => {
    if (!isFiniteNumber(value)) {
      return 'must be a number';
    }

    return test(value) ? null : problem;
  };
}

const positive = numberWhere((value) => value > 0, 'must be greater than 0');
const eccentricity = numberWhere(
  (value) => value >= 0 && value < 1,
  'must be in the range [0, 1)',
);
const axialTilt = numberWhere(
  (value) => value >= 0 && value <= 180,
  'must be in the range [0, 180]',
);

const text: Rule = (value) =>
  typeof value === 'string' && value !== ''
    ? null
    : 'must be a non-empty string';

const id: Rule = (value) =>
  typeof value === 'string' && ID_PATTERN.test(value)
    ? null
    : 'may contain only lowercase letters, digits, and hyphens';

const textOrNull: Rule = (value) =>
  value === null || text(value) === null
    ? null
    : 'must be a non-empty string or null';

const bodyType: Rule = (value) =>
  BODY_TYPES.some((type) => type === value)
    ? null
    : `must be one of: ${BODY_TYPES.join(', ')}`;

const epoch: Rule = (value) => (value === 'J2000' ? null : 'must be J2000');

const color: Rule = (value) =>
  typeof value === 'string' && COLOR_PATTERN.test(value)
    ? null
    : 'must match #rrggbb';

function createChecker(label: string, errors: string[]) {
  const has = (source: Fields, key: string): boolean =>
    source[key] !== undefined;

  return {
    field(
      source: Fields,
      path: string,
      key: string,
      rule: Rule,
      optional = false,
    ): void {
      if (!has(source, key)) {
        if (!optional) {
          errors.push(`${label}: missing field ${path}${key}`);
        }
        return;
      }

      const problem = rule(source[key]);
      if (problem !== null) {
        errors.push(`${label}: field ${path}${key} ${problem}`);
      }
    },
    group(source: Fields, key: string, optional = false): Fields | null {
      if (!has(source, key)) {
        if (!optional) {
          errors.push(`${label}: missing field ${key}`);
        }
        return null;
      }

      const value = source[key];
      if (!isFields(value)) {
        errors.push(`${label}: field ${key} must be an object`);
        return null;
      }

      return value;
    },
  };
}

function isValidBody(
  raw: unknown,
  index: number,
  errors: string[],
): raw is BodyDef {
  const errorsBefore = errors.length;

  if (!isFields(raw)) {
    errors.push(`Body #${index + 1}: entry must be an object`);
    return false;
  }

  const label =
    typeof raw.id === 'string' && raw.id !== '' ? raw.id : `Body #${index + 1}`;
  const check = createChecker(label, errors);

  check.field(raw, '', 'id', id);
  check.field(raw, '', 'name', text);
  check.field(raw, '', 'type', bodyType);
  check.field(raw, '', 'parentId', textOrNull);
  check.field(raw, '', 'radiusKm', positive);
  check.field(raw, '', 'mass', positive, true);
  check.field(raw, '', 'contentKey', text);

  // A star and a belt may have no orbit: the solver puts them at (0, 0, 0).
  const orbit = check.group(
    raw,
    'orbit',
    raw.type === 'star' || raw.type === 'belt',
  );
  if (orbit) {
    check.field(orbit, 'orbit.', 'semiMajorAxisAu', positive);
    check.field(orbit, 'orbit.', 'eccentricity', eccentricity);
    check.field(orbit, 'orbit.', 'inclinationDeg', anyNumber);
    check.field(orbit, 'orbit.', 'longitudeAscendingNodeDeg', anyNumber);
    check.field(orbit, 'orbit.', 'argumentPeriapsisDeg', anyNumber);
    check.field(orbit, 'orbit.', 'meanAnomalyAtEpochDeg', anyNumber);
    check.field(orbit, 'orbit.', 'epoch', epoch);
    check.field(orbit, 'orbit.', 'periodDays', positive);
    checkAxisUnit(raw, label, orbit, errors);
  }

  const rotation = check.group(raw, 'rotation');
  if (rotation) {
    check.field(rotation, 'rotation.', 'periodHours', positive);
    check.field(rotation, 'rotation.', 'axialTiltDeg', axialTilt);
  }

  const visual = check.group(raw, 'visual');
  if (visual) {
    check.field(visual, 'visual.', 'texture', textOrNull);
    check.field(visual, 'visual.', 'ringTexture', text, true);
    check.field(visual, 'visual.', 'color', color);
  }

  return errors.length === errorsBefore;
}

function checkHierarchy(bodies: readonly BodyDef[], errors: string[]): void {
  const byId = new Map<string, BodyDef>();

  for (const body of bodies) {
    if (byId.has(body.id)) {
      errors.push(`${body.id}: field id is duplicated`);
    }
    byId.set(body.id, body);
  }

  for (const body of bodies) {
    if (body.parentId !== null && !byId.has(body.parentId)) {
      errors.push(
        `${body.id}: field parentId points to a missing body "${body.parentId}"`,
      );
    }
  }

  for (const body of bodies) {
    const visited = new Set([body.id]);
    const chain = [body.id];
    let parentId = body.parentId;

    while (parentId !== null) {
      chain.push(parentId);
      if (visited.has(parentId)) {
        errors.push(
          `${body.id}: field parentId forms a cycle (${chain.join(' → ')})`,
        );
        break;
      }
      visited.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }

  const roots = bodies.filter((body) => body.parentId === null);
  if (roots.length !== 1) {
    errors.push(
      `There must be exactly one root (a body with parentId: null), found ${roots.length}`,
    );
  }

  for (const root of roots) {
    if (root.type !== 'star') {
      errors.push(`${root.id}: root must have type: 'star'`);
    }
    if (root.orbit !== undefined) {
      errors.push(`${root.id}: root must not have an orbit field`);
    }
  }

  checkMoonParents(bodies, errors);
}

function checkAxisUnit(
  raw: Fields,
  label: string,
  orbit: Fields,
  errors: string[],
): void {
  if (!isFiniteNumber(orbit.semiMajorAxisAu)) {
    return;
  }

  const axis = orbit.semiMajorAxisAu;
  if (raw.type === 'moon' && axis < MOON_AXIS_MIN_KM) {
    errors.push(
      `${label}: field orbit.semiMajorAxisAu must be >= ${MOON_AXIS_MIN_KM} (km for a moon), got ${axis}`,
    );
  }
  if (raw.type !== 'moon' && axis >= MOON_AXIS_MIN_KM) {
    errors.push(
      `${label}: field orbit.semiMajorAxisAu must be < ${MOON_AXIS_MIN_KM} (AU for a body that is not a moon), got ${axis}`,
    );
  }
}

function checkMoonParents(bodies: readonly BodyDef[], errors: string[]): void {
  const indexById = new Map<string, number>();
  const byId = new Map<string, BodyDef>();

  for (let index = 0; index < bodies.length; index += 1) {
    const body = bodies[index];
    if (body === undefined || indexById.has(body.id)) {
      continue;
    }
    indexById.set(body.id, index);
    byId.set(body.id, body);
  }

  for (const body of bodies) {
    if (body.type !== 'moon') {
      continue;
    }

    const parent = body.parentId === null ? undefined : byId.get(body.parentId);
    if (body.parentId !== null && parent === undefined) {
      continue;
    }

    const parentIndex =
      body.parentId === null ? undefined : indexById.get(body.parentId);
    const bodyIndex = indexById.get(body.id);
    const earlierParent =
      parent !== undefined &&
      parentIndex !== undefined &&
      bodyIndex !== undefined &&
      parentIndex < bodyIndex &&
      (parent.type === 'planet' || parent.type === 'dwarf');

    if (!earlierParent) {
      const got = body.parentId === null ? 'null' : `"${body.parentId}"`;
      errors.push(
        `${body.id}: field parentId must reference an earlier planet or dwarf, got ${got}`,
      );
    }
  }
}

export function validateBodies(input: unknown): ValidationResult {
  if (!Array.isArray(input)) {
    return { ok: false, errors: ['Body data must be an array'] };
  }

  const errors: string[] = [];
  const bodies: BodyDef[] = [];

  input.forEach((raw: unknown, index) => {
    if (isValidBody(raw, index, errors)) {
      bodies.push(raw);
    }
  });

  if (errors.length === 0) {
    checkHierarchy(bodies, errors);
  }

  return errors.length === 0 ? { ok: true, bodies } : { ok: false, errors };
}
