// Schema of the body card content (ADR-010, EMI-218). The Polish texts live in
// pl/bodies.json, keyed by `contentKey` from src/data/bodies.json.

export type ContentSource = { name: string; url: string };

export type BodyContent = {
  kind: string; // for example "gas giant", in Polish
  funFact: { text: string; source: ContentSource }; // text: at most FUN_FACT_MAX_WORDS words
  description: string; // longer text for the "More" state
};

export type BodyContentCatalog = Readonly<Record<string, BodyContent>>;

export const FUN_FACT_MAX_WORDS = 15;

const FN = 'parseBodyContentCatalog';

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

function readRecord(
  value: unknown,
  path: string,
  fields: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw invalid(path, 'must be an object', value);
  }
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) {
      throw invalid(`${path}.${key}`, 'is not a known field', value[key]);
    }
  }
  return value;
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

function readSource(value: unknown, path: string): ContentSource {
  const record = readRecord(value, path, ['name', 'url']);
  const name = readText(record.name, `${path}.name`);
  const url = readText(record.url, `${path}.url`);
  if (!url.startsWith('https://')) {
    throw invalid(`${path}.url`, 'must start with https://', url);
  }
  return { name, url };
}

function readEntry(value: unknown, path: string): BodyContent {
  const record = readRecord(value, path, ['kind', 'funFact', 'description']);
  const kind = readText(record.kind, `${path}.kind`);
  const funFact = readRecord(record.funFact, `${path}.funFact`, [
    'text',
    'source',
  ]);
  const text = readText(funFact.text, `${path}.funFact.text`);
  const words = countWords(text);
  if (words > FUN_FACT_MAX_WORDS) {
    throw invalid(
      `${path}.funFact.text`,
      `must have at most ${FUN_FACT_MAX_WORDS} words`,
      words,
    );
  }
  const source = readSource(funFact.source, `${path}.funFact.source`);
  const description = readText(record.description, `${path}.description`);
  return { kind, funFact: { text, source }, description };
}

/** Checks raw JSON against the schema; its keys must equal `contentKeys`. */
export function parseBodyContentCatalog(
  raw: unknown,
  contentKeys: readonly string[],
): BodyContentCatalog {
  if (!isRecord(raw)) {
    throw invalid('raw', 'must be an object', raw);
  }
  if (contentKeys.length === 0) {
    throw invalid('contentKeys', 'must not be empty', contentKeys);
  }

  const expected = new Set(contentKeys);
  for (const key of Object.keys(raw)) {
    if (!expected.has(key)) {
      throw invalid(`raw.${key}`, 'is not a contentKey', raw[key]);
    }
  }

  const catalog: Record<string, BodyContent> = {};
  for (const key of expected) {
    if (!Object.hasOwn(raw, key)) {
      throw invalid(`raw.${key}`, 'must be present', undefined);
    }
    catalog[key] = readEntry(raw[key], `raw.${key}`);
  }
  return Object.freeze(catalog);
}
