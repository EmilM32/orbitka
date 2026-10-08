import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

import {
  FUN_FACT_MAX_WORDS,
  parseBodyContentCatalog,
} from '@content/bodyContent.ts';
import realJson from '@content/pl/bodies.json' with { type: 'json' };

const KEYS = [
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
];

const FN = 'parseBodyContentCatalog';

function copy(): Record<string, Record<string, unknown>> {
  return structuredClone(realJson) as Record<string, Record<string, unknown>>;
}

function words(text: string): number {
  return text.trim().split(/\s+/).length;
}

test('bodyContent › catalog matches contentKeys', () => {
  const catalog = parseBodyContentCatalog(realJson, KEYS);

  expect(Object.keys(catalog).sort()).toEqual([...KEYS].sort());
  for (const entry of Object.values(catalog)) {
    expect(words(entry.funFact.text)).toBeLessThanOrEqual(FUN_FACT_MAX_WORDS);
    expect(entry.funFact.source.url.startsWith('https://')).toBe(true);
  }
});

test('bodyContent › rejects a missing key', () => {
  const raw = copy();
  delete raw.mars;

  expect(() => parseBodyContentCatalog(raw, KEYS)).toThrow(
    new RangeError(
      `${FN}: parameter "raw.mars" must be present, got undefined`,
    ),
  );
});

test('bodyContent › rejects an extra key', () => {
  const raw = { ...copy(), pluto: copy().mars };

  expect(() => parseBodyContentCatalog(raw, KEYS)).toThrow(
    new RangeError(
      `${FN}: parameter "raw.pluto" is not a contentKey, got object`,
    ),
  );
});

test('bodyContent › rejects kind of the wrong type', () => {
  const raw = copy();
  raw.jupiter = { ...raw.jupiter, kind: 42 };

  expect(() => parseBodyContentCatalog(raw, KEYS)).toThrow(
    new RangeError(
      `${FN}: parameter "raw.jupiter.kind" must be a non-empty string, got 42`,
    ),
  );
});

test('bodyContent › rejects a fun fact longer than 15 words', () => {
  const raw = copy();
  raw.jupiter = {
    ...raw.jupiter,
    funFact: {
      ...(raw.jupiter?.funFact as object),
      text: `  ${Array.from({ length: 16 }, (_, index) => `w${index}`).join('   ')} `,
    },
  };

  expect(() => parseBodyContentCatalog(raw, KEYS)).toThrow(
    new RangeError(
      `${FN}: parameter "raw.jupiter.funFact.text" must have at most 15 words, got 16`,
    ),
  );
});

test('bodyContent › counts words across repeated spaces', () => {
  const raw = copy();
  raw.jupiter = {
    ...raw.jupiter,
    funFact: {
      ...(raw.jupiter?.funFact as object),
      text: ` ${Array.from({ length: 15 }, () => 'a').join('  \t ')}  `,
    },
  };

  expect(() => parseBodyContentCatalog(raw, KEYS)).not.toThrow();
});

test('bodyContent › rejects a source without https://', () => {
  const raw = copy();
  raw.saturn = {
    ...raw.saturn,
    funFact: {
      text: 'Tekst.',
      source: { name: 'NASA', url: 'http://nssdc.gsfc.nasa.gov/' },
    },
  };

  expect(() => parseBodyContentCatalog(raw, KEYS)).toThrow(
    new RangeError(
      `${FN}: parameter "raw.saturn.funFact.source.url" must start with https://, got "http://nssdc.gsfc.nasa.gov/"`,
    ),
  );
});

test('bodyContent › rejects an unknown field', () => {
  const raw = copy();
  raw.earth = { ...raw.earth, status: 'placeholder' };

  expect(() => parseBodyContentCatalog(raw, KEYS)).toThrow(
    new RangeError(
      `${FN}: parameter "raw.earth.status" is not a known field, got "placeholder"`,
    ),
  );
});

test.each([
  [null, 'null'],
  [[], 'array of length 0'],
  ['text', '"text"'],
  [3, '3'],
])('bodyContent › rejects raw %j', (raw, got) => {
  expect(() => parseBodyContentCatalog(raw, KEYS)).toThrow(
    new RangeError(`${FN}: parameter "raw" must be an object, got ${got}`),
  );
});

test('bodyContent › rejects empty contentKeys', () => {
  expect(() => parseBodyContentCatalog(realJson, [])).toThrow(
    new RangeError(
      `${FN}: parameter "contentKeys" must not be empty, got array of length 0`,
    ),
  );
});

test('bodyContent › SOURCE.md lists every key', () => {
  const markdown = readFileSync(
    new URL('../../src/content/pl/bodies.SOURCE.md', import.meta.url),
    'utf8',
  );
  const statuses = new Map<string, string>();
  for (const line of markdown.split('\n')) {
    const match = /^\|\s*`([a-z]+)`\s*\|\s*([a-z]+)\s*\|/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      statuses.set(match[1], match[2]);
    }
  }

  expect([...statuses.keys()].sort()).toEqual(Object.keys(realJson).sort());
  for (const status of statuses.values()) {
    expect(['placeholder', 'approved']).toContain(status);
  }
});
