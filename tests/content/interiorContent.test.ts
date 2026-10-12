import { expect, test } from 'vitest';

import {
  INTERIOR_TEXT_MAX_WORDS,
  parseInteriorContent,
} from '@content/interiorContent.ts';
import realJson from '@content/pl/interiors.json' with { type: 'json' };
import { INTERIOR_BODY_IDS, interiors } from '@data/interiors.ts';

const EXPECTED = INTERIOR_BODY_IDS.map((id) => {
  const entry = interiors.get(id);
  if (entry === undefined) {
    throw new Error(`missing interior ${id}`);
  }
  return { id, layerIds: entry.layers.map((layer) => layer.id) };
});

function words(text: string): number {
  return text.trim().split(/\s+/).length;
}

test('interiorContent › catalog matches the data layers', () => {
  const catalog = parseInteriorContent(realJson, EXPECTED);
  expect(Object.keys(catalog).sort()).toEqual([...INTERIOR_BODY_IDS].sort());
  for (const entry of EXPECTED) {
    const body = catalog[entry.id];
    if (body === undefined) {
      throw new Error(`missing copy ${entry.id}`);
    }
    expect(Object.keys(body.layers).sort()).toEqual([...entry.layerIds].sort());
    for (const layer of Object.values(body.layers)) {
      expect(words(layer.text)).toBeLessThanOrEqual(INTERIOR_TEXT_MAX_WORDS);
      expect(layer.name.trim()).not.toBe('');
    }
  }
});

test('interiorContent › rejects a missing layer', () => {
  const raw = structuredClone(realJson) as {
    earth: { layers: Record<string, unknown> };
  };
  delete raw.earth.layers.crust;

  expect(() => parseInteriorContent(raw, EXPECTED)).toThrow(
    /raw\.earth\.layers\.crust/,
  );
});

test('interiorContent › rejects an extra body', () => {
  const raw = { ...realJson, pluto: realJson.earth };

  expect(() => parseInteriorContent(raw, EXPECTED)).toThrow(/raw\.pluto/);
});
