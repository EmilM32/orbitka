import { expect, test } from 'vitest';

import { bodies } from '@data/bodies.ts';
import {
  INTERIOR_BODY_IDS,
  INTERIOR_TEXTURES,
  MIN_DISPLAY_FRACTION_GAP,
  interiors,
  layerMeasure,
  validateInteriors,
} from '@data/interiors.ts';

test('interiors › the catalog matches the body radii', () => {
  expect([...interiors.keys()].sort()).toEqual([...INTERIOR_BODY_IDS].sort());

  for (const id of INTERIOR_BODY_IDS) {
    const entry = interiors.get(id);
    const body = bodies.find((candidate) => candidate.id === id);
    if (entry === undefined || body === undefined) {
      throw new Error(`missing interior for ${id}`);
    }
    expect(entry.layers[0]?.outerRadiusKm).toBe(body.radiusKm);
    expect(entry.layers[0]?.displayFraction).toBe(1);
    expect(entry.source.url.startsWith('https://')).toBe(true);
    for (let index = 1; index < entry.layers.length; index += 1) {
      const previous = entry.layers[index - 1];
      const current = entry.layers[index];
      if (previous === undefined || current === undefined) {
        throw new Error(`missing layer ${index} of ${id}`);
      }
      expect(current.outerRadiusKm).toBeLessThan(previous.outerRadiusKm);
      expect(
        previous.displayFraction - current.displayFraction,
      ).toBeGreaterThanOrEqual(MIN_DISPLAY_FRACTION_GAP - 1e-9);
    }
    const innermost = entry.layers.length - 1;
    expect(layerMeasure(entry.layers, innermost).kind).toBe('radius');
    expect(layerMeasure(entry.layers, 0).kind).toBe('thickness');
  }

  expect(interiors.get('jupiter')?.atmosphere).toBe(true);
  expect(interiors.get('earth')?.atmosphere).toBe(false);
  expect(interiors.has('io')).toBe(false);
});

test('interiors › earth thicknesses', () => {
  const layers = interiors.get('earth')?.layers;
  if (layers === undefined) {
    throw new Error('missing earth');
  }
  expect(layerMeasure(layers, 0)).toEqual({ kind: 'thickness', km: 35 });
  expect(layerMeasure(layers, 3)).toEqual({ kind: 'radius', km: 1221 });
  expect(() => layerMeasure(layers, 9)).toThrow(RangeError);
});

test('interiors › a thin shell and an unknown body are rejected', () => {
  const raw = [
    {
      id: 'earth',
      source: { name: 'USGS', url: 'https://example.com' },
      atmosphere: false,
      layers: [
        {
          id: 'crust',
          outerRadiusKm: 6371,
          displayFraction: 1,
          color: '#C4A574',
          texture: 'rock',
        },
        {
          id: 'core',
          outerRadiusKm: 1221,
          displayFraction: 0.99,
          color: '#F2E24B',
          texture: 'metal',
        },
      ],
    },
  ];
  const known = INTERIOR_BODY_IDS.map((id) => ({
    id,
    radiusKm: bodies.find((body) => body.id === id)?.radiusKm ?? 1,
  }));
  const result = validateInteriors(raw, known);
  expect(result.ok).toBe(false);
  if (result.ok) {
    return;
  }
  expect(result.errors.some((error) => error.includes('displayFraction'))).toBe(
    true,
  );
  expect(result.errors.some((error) => error.includes('missing body'))).toBe(
    true,
  );

  const lava = validateInteriors(
    [
      {
        ...raw[0],
        layers: [
          raw[0]?.layers[0],
          { ...raw[0]?.layers[1], displayFraction: 0.2, texture: 'lava' },
        ],
      },
    ],
    known,
  );
  expect(lava.ok).toBe(false);
  if (lava.ok) {
    return;
  }
  expect(lava.errors.some((error) => error.includes('layers[1].texture'))).toBe(
    true,
  );
});

test('interiors › every layer names a texture the renderer draws', () => {
  for (const entry of interiors.values()) {
    for (const layer of entry.layers) {
      expect(INTERIOR_TEXTURES).toContain(layer.texture);
    }
  }
  expect(interiors.get('earth')?.layers.map((layer) => layer.texture)).toEqual([
    'rock',
    'rock',
    'liquid-metal',
    'metal',
  ]);
  expect(interiors.get('sun')?.layers[0]?.texture).toBe('convection');
});
