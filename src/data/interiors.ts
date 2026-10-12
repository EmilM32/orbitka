import raw from './interiors.json' with { type: 'json' };
import { bodies } from './bodies.ts';

export const MIN_DISPLAY_FRACTION_GAP = 0.08;

const ID_PATTERN = /^[a-z0-9-]+$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// Sun, the eight planets, and the Moon. The Galilean moons have no cutaway.
export const INTERIOR_BODY_IDS = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'moon',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
] as const;

export type InteriorLayer = {
  id: string;
  /** True outer radius, kilometers. The first layer matches the body radius. */
  outerRadiusKm: number;
  /** Share of the mesh radius on the diagram. The first layer is 1. */
  displayFraction: number;
  color: string;
};

export type InteriorEntry = {
  id: string;
  source: { name: string; url: string };
  /** The outer layer is an atmosphere, not a hard surface. */
  atmosphere: boolean;
  layers: readonly InteriorLayer[];
};

export type InteriorCatalog = ReadonlyMap<string, InteriorEntry>;

export type InteriorValidation =
  { ok: true; entries: InteriorEntry[] } | { ok: false; errors: string[] };

export type LayerMeasure =
  { kind: 'thickness'; km: number } | { kind: 'radius'; km: number };

type BodyRadius = { id: string; radiusKm: number };

type Fields = Record<string, unknown>;

const LAYER_FIELDS = ['id', 'outerRadiusKm', 'displayFraction', 'color'];
const ENTRY_FIELDS = ['id', 'source', 'atmosphere', 'layers'];
const SOURCE_FIELDS = ['name', 'url'];

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Thickness of a shell, or the radius of the innermost layer. */
export function layerMeasure(
  layers: readonly { outerRadiusKm: number }[],
  index: number,
): LayerMeasure {
  const layer = layers[index];
  if (layer === undefined) {
    throw new RangeError(
      `layerMeasure: parameter "index" must be inside layers, got ${index}`,
    );
  }
  const next = layers[index + 1];
  if (next === undefined) {
    return { kind: 'radius', km: layer.outerRadiusKm };
  }
  return { kind: 'thickness', km: layer.outerRadiusKm - next.outerRadiusKm };
}

function pushUnknown(
  errors: string[],
  label: string,
  value: Fields,
  known: readonly string[],
): void {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) {
      errors.push(`${label}: unknown field ${key}`);
    }
  }
}

function readLayers(
  value: unknown,
  label: string,
  radiusKm: number,
  errors: string[],
): InteriorLayer[] {
  if (!Array.isArray(value) || value.length < 2) {
    errors.push(`${label}: field layers must be an array of at least 2`);
    return [];
  }

  const layers: InteriorLayer[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    const path = `${label}: field layers[${index}]`;
    if (!isFields(item)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    pushUnknown(errors, path, item, LAYER_FIELDS);

    const id = item.id;
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      errors.push(
        `${path}.id may contain only lowercase letters, digits, and hyphens`,
      );
    } else if (seen.has(id)) {
      errors.push(`${path}.id is duplicated`);
    } else {
      seen.add(id);
    }

    const outer = item.outerRadiusKm;
    if (!isFiniteNumber(outer) || outer <= 0) {
      errors.push(`${path}.outerRadiusKm must be a number > 0`);
    }

    const fraction = item.displayFraction;
    if (!isFiniteNumber(fraction) || fraction <= 0 || fraction > 1) {
      errors.push(`${path}.displayFraction must be a number in (0, 1]`);
    }

    const color = item.color;
    if (typeof color !== 'string' || !COLOR_PATTERN.test(color)) {
      errors.push(`${path}.color must match #rrggbb`);
    }

    if (
      typeof id === 'string' &&
      isFiniteNumber(outer) &&
      isFiniteNumber(fraction) &&
      typeof color === 'string'
    ) {
      layers.push({
        id,
        outerRadiusKm: outer,
        displayFraction: fraction,
        color,
      });
    }
  }

  if (layers.length !== value.length) {
    return layers;
  }

  const first = layers[0];
  if (first === undefined) {
    return layers;
  }
  if (first.outerRadiusKm !== radiusKm) {
    errors.push(
      `${label}: field layers[0].outerRadiusKm must equal radiusKm (${radiusKm}), got ${first.outerRadiusKm}`,
    );
  }
  if (first.displayFraction !== 1) {
    errors.push(
      `${label}: field layers[0].displayFraction must be 1, got ${first.displayFraction}`,
    );
  }

  for (let index = 1; index < layers.length; index += 1) {
    const previous = layers[index - 1];
    const current = layers[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    if (current.outerRadiusKm >= previous.outerRadiusKm) {
      errors.push(
        `${label}: field layers[${index}].outerRadiusKm must be < the layer outside it`,
      );
    }
    if (
      current.displayFraction >
      previous.displayFraction - MIN_DISPLAY_FRACTION_GAP + 1e-9
    ) {
      errors.push(
        `${label}: field layers[${index}].displayFraction must be at least ${MIN_DISPLAY_FRACTION_GAP} below the layer outside it`,
      );
    }
  }

  return layers;
}

/**
 * Checks raw JSON against the interior schema. `known` supplies `radiusKm`
 * for each body the catalog is allowed to describe.
 */
export function validateInteriors(
  value: unknown,
  known: readonly BodyRadius[],
): InteriorValidation {
  const errors: string[] = [];
  if (!Array.isArray(value)) {
    return { ok: false, errors: ['interiors: must be an array'] };
  }

  const radii = new Map(known.map((body) => [body.id, body.radiusKm]));
  const expected = new Set<string>(INTERIOR_BODY_IDS);
  const seen = new Set<string>();
  const entries: InteriorEntry[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    const label = `interiors[${index}]`;
    if (!isFields(item)) {
      errors.push(`${label}: must be an object`);
      continue;
    }
    pushUnknown(errors, label, item, ENTRY_FIELDS);

    const id = item.id;
    if (typeof id !== 'string' || !expected.has(id)) {
      errors.push(
        `${label}: field id must be one of: ${INTERIOR_BODY_IDS.join(', ')}`,
      );
      continue;
    }
    if (seen.has(id)) {
      errors.push(`${label}: field id is duplicated`);
      continue;
    }
    seen.add(id);

    const radiusKm = radii.get(id);
    if (radiusKm === undefined) {
      errors.push(`${label}: body "${id}" has no radiusKm`);
      continue;
    }

    const source = item.source;
    let sourceName = '';
    let sourceUrl = '';
    if (!isFields(source)) {
      errors.push(`${label}: field source must be an object`);
    } else {
      pushUnknown(errors, `${label}: field source`, source, SOURCE_FIELDS);
      if (typeof source.name !== 'string' || source.name.trim() === '') {
        errors.push(`${label}: field source.name must be a non-empty string`);
      } else {
        sourceName = source.name;
      }
      if (
        typeof source.url !== 'string' ||
        !source.url.startsWith('https://')
      ) {
        errors.push(`${label}: field source.url must start with https://`);
      } else {
        sourceUrl = source.url;
      }
    }

    if (typeof item.atmosphere !== 'boolean') {
      errors.push(`${label}: field atmosphere must be a boolean`);
    }

    const layers = readLayers(item.layers, label, radiusKm, errors);
    if (
      sourceName !== '' &&
      sourceUrl !== '' &&
      typeof item.atmosphere === 'boolean' &&
      layers.length ===
        (Array.isArray(item.layers) ? item.layers.length : -1) &&
      layers.length >= 2
    ) {
      entries.push({
        id,
        source: { name: sourceName, url: sourceUrl },
        atmosphere: item.atmosphere,
        layers,
      });
    }
  }

  for (const id of INTERIOR_BODY_IDS) {
    if (!seen.has(id)) {
      errors.push(`interiors: missing body "${id}"`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, entries };
}

const result = validateInteriors(raw, bodies);

if (!result.ok) {
  throw new Error(`Invalid interior data:\n${result.errors.join('\n')}`);
}

export const interiors: InteriorCatalog = new Map(
  result.entries.map((entry) => [entry.id, entry]),
);
