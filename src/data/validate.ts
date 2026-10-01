import type { BodyDef, BodyType, ValidationResult } from './types.ts';

type Fields = Record<string, unknown>;

// Zwraca opis problemu z wartością albo null, gdy wartość jest poprawna.
type Rule = (value: unknown) => string | null;

const BODY_TYPES: readonly BodyType[] = [
  'star',
  'planet',
  'dwarf',
  'moon',
  'belt',
];
const ID_PATTERN = /^[a-z0-9-]+$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const anyNumber: Rule = (value) =>
  isFiniteNumber(value) ? null : 'musi być liczbą';

function numberWhere(test: (value: number) => boolean, problem: string): Rule {
  return (value) => {
    if (!isFiniteNumber(value)) {
      return 'musi być liczbą';
    }

    return test(value) ? null : problem;
  };
}

const positive = numberWhere((value) => value > 0, 'musi być większe od 0');
const eccentricity = numberWhere(
  (value) => value >= 0 && value < 1,
  'musi być w przedziale [0, 1)',
);
const axialTilt = numberWhere(
  (value) => value >= 0 && value <= 180,
  'musi być w przedziale [0, 180]',
);

const text: Rule = (value) =>
  typeof value === 'string' && value !== ''
    ? null
    : 'musi być niepustym tekstem';

const id: Rule = (value) =>
  typeof value === 'string' && ID_PATTERN.test(value)
    ? null
    : 'może zawierać tylko małe litery, cyfry i myślniki';

const textOrNull: Rule = (value) =>
  value === null || text(value) === null
    ? null
    : 'musi być niepustym tekstem albo null';

const bodyType: Rule = (value) =>
  BODY_TYPES.some((type) => type === value)
    ? null
    : `musi mieć jedną z wartości: ${BODY_TYPES.join(', ')}`;

const epoch: Rule = (value) =>
  value === 'J2000' ? null : 'musi mieć wartość J2000';

const color: Rule = (value) =>
  typeof value === 'string' && COLOR_PATTERN.test(value)
    ? null
    : 'musi mieć format #rrggbb';

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
          errors.push(`${label}: brak pola ${path}${key}`);
        }
        return;
      }

      const problem = rule(source[key]);
      if (problem !== null) {
        errors.push(`${label}: pole ${path}${key} ${problem}`);
      }
    },
    group(source: Fields, key: string, optional = false): Fields | null {
      if (!has(source, key)) {
        if (!optional) {
          errors.push(`${label}: brak pola ${key}`);
        }
        return null;
      }

      const value = source[key];
      if (!isFields(value)) {
        errors.push(`${label}: pole ${key} musi być obiektem`);
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
    errors.push(`Ciało #${index + 1}: wpis musi być obiektem`);
    return false;
  }

  const label =
    typeof raw.id === 'string' && raw.id !== ''
      ? raw.id
      : `Ciało #${index + 1}`;
  const check = createChecker(label, errors);

  check.field(raw, '', 'id', id);
  check.field(raw, '', 'name', text);
  check.field(raw, '', 'type', bodyType);
  check.field(raw, '', 'parentId', textOrNull);
  check.field(raw, '', 'radiusKm', positive);
  check.field(raw, '', 'mass', positive, true);
  check.field(raw, '', 'contentKey', text);

  const orbit = check.group(raw, 'orbit', raw.type === 'star');
  if (orbit) {
    check.field(orbit, 'orbit.', 'semiMajorAxisAu', positive);
    check.field(orbit, 'orbit.', 'eccentricity', eccentricity);
    check.field(orbit, 'orbit.', 'inclinationDeg', anyNumber);
    check.field(orbit, 'orbit.', 'longitudeAscendingNodeDeg', anyNumber);
    check.field(orbit, 'orbit.', 'argumentPeriapsisDeg', anyNumber);
    check.field(orbit, 'orbit.', 'meanAnomalyAtEpochDeg', anyNumber);
    check.field(orbit, 'orbit.', 'epoch', epoch);
    check.field(orbit, 'orbit.', 'periodDays', positive);
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
      errors.push(`${body.id}: pole id powtarza się`);
    }
    byId.set(body.id, body);
  }

  for (const body of bodies) {
    if (body.parentId !== null && !byId.has(body.parentId)) {
      errors.push(
        `${body.id}: pole parentId wskazuje nieistniejące ciało „${body.parentId}”`,
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
          `${body.id}: pole parentId tworzy cykl (${chain.join(' → ')})`,
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
      `Musi być dokładnie jeden korzeń (ciało z parentId: null), a jest ${roots.length}`,
    );
  }

  for (const root of roots) {
    if (root.type !== 'star') {
      errors.push(`${root.id}: korzeń musi mieć type: 'star'`);
    }
    if (root.orbit !== undefined) {
      errors.push(`${root.id}: korzeń nie może mieć pola orbit`);
    }
  }
}

export function validateBodies(input: unknown): ValidationResult {
  if (!Array.isArray(input)) {
    return { ok: false, errors: ['Dane ciał muszą być tablicą'] };
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
