// Polish names and one sentence per interior layer (EMI-263). The kilometers
// and colors live in src/data/interiors.json. This file is the copy only.

export type InteriorLayerContent = {
  name: string;
  text: string;
};

export type InteriorBodyContent = {
  layers: Readonly<Record<string, InteriorLayerContent>>;
};

export type InteriorContentCatalog = Readonly<
  Record<string, InteriorBodyContent>
>;

export const INTERIOR_TEXT_MAX_WORDS = 40;

const FN = 'parseInteriorContent';

export type InteriorContentExpect = {
  id: string;
  layerIds: readonly string[];
};

function describe(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `array of length ${value.length}`;
  }
  if (value === null) {
    return 'null';
  }
  return typeof value === 'object' ? 'object' : String(value);
}

function invalid(
  path: string,
  requirement: string,
  value: unknown,
): RangeError {
  return new RangeError(
    `${FN}: parameter "${path}" ${requirement}, got ${describe(value)}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw invalid(path, 'must be a non-empty string', value);
  }
  return value;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

function readLayer(value: unknown, path: string): InteriorLayerContent {
  if (!isRecord(value)) {
    throw invalid(path, 'must be an object', value);
  }
  for (const key of Object.keys(value)) {
    if (key !== 'name' && key !== 'text') {
      throw invalid(`${path}.${key}`, 'is not a known field', value[key]);
    }
  }
  const name = readText(value.name, `${path}.name`);
  const text = readText(value.text, `${path}.text`);
  const words = countWords(text);
  if (words > INTERIOR_TEXT_MAX_WORDS) {
    throw invalid(
      `${path}.text`,
      `must have at most ${INTERIOR_TEXT_MAX_WORDS} words`,
      words,
    );
  }
  return { name, text };
}

/** Checks raw JSON. Keys and layer ids must match `expected`. */
export function parseInteriorContent(
  raw: unknown,
  expected: readonly InteriorContentExpect[],
): InteriorContentCatalog {
  if (!isRecord(raw)) {
    throw invalid('raw', 'must be an object', raw);
  }
  if (expected.length === 0) {
    throw invalid('expected', 'must not be empty', expected);
  }

  const byId = new Map(expected.map((entry) => [entry.id, entry]));
  for (const key of Object.keys(raw)) {
    if (!byId.has(key)) {
      throw invalid(`raw.${key}`, 'is not an interior body id', raw[key]);
    }
  }

  const catalog: Record<string, InteriorBodyContent> = {};
  for (const entry of expected) {
    if (!Object.hasOwn(raw, entry.id)) {
      throw invalid(`raw.${entry.id}`, 'must be present', undefined);
    }
    const body = raw[entry.id];
    const path = `raw.${entry.id}`;
    if (!isRecord(body)) {
      throw invalid(path, 'must be an object', body);
    }
    for (const key of Object.keys(body)) {
      if (key !== 'layers') {
        throw invalid(`${path}.${key}`, 'is not a known field', body[key]);
      }
    }
    const layersRaw = body.layers;
    if (!isRecord(layersRaw)) {
      throw invalid(`${path}.layers`, 'must be an object', layersRaw);
    }
    const wanted = new Set(entry.layerIds);
    for (const layerId of Object.keys(layersRaw)) {
      if (!wanted.has(layerId)) {
        throw invalid(
          `${path}.layers.${layerId}`,
          'is not a layer id',
          layersRaw[layerId],
        );
      }
    }
    const layers: Record<string, InteriorLayerContent> = {};
    for (const layerId of entry.layerIds) {
      if (!Object.hasOwn(layersRaw, layerId)) {
        throw invalid(
          `${path}.layers.${layerId}`,
          'must be present',
          undefined,
        );
      }
      layers[layerId] = readLayer(
        layersRaw[layerId],
        `${path}.layers.${layerId}`,
      );
    }
    catalog[entry.id] = { layers };
  }

  return Object.freeze(catalog);
}
