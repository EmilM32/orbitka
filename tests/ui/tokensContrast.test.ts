import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

// The pairs of docs/design/contrast.md, computed on the values in
// src/ui/tokens.css, so a token change that breaks contrast fails here.
// A pair is a foreground over a stack of layers, bottom first; translucent
// layers are composited in sRGB like contrast.md does. Scene colors (the Sun
// glow, body colors from bodies.json) are literals. The label pills are left
// out: their colors are not tokens yet (EMI-206).

type Rgba = [number, number, number, number];

const TOKENS = readFileSync('src/ui/tokens.css', 'utf8');
const ROOT_BLOCK = TOKENS.slice(
  TOKENS.indexOf(':root {'),
  TOKENS.indexOf('\n}', TOKENS.indexOf(':root {')),
);

function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/iu.exec(value);
  if (hex !== null) {
    const digits = hex[1] ?? '000000';
    return [
      Number.parseInt(digits.slice(0, 2), 16),
      Number.parseInt(digits.slice(2, 4), 16),
      Number.parseInt(digits.slice(4, 6), 16),
      1,
    ];
  }
  const rgba = /^rgba?\(([^)]+)\)$/u.exec(value);
  if (rgba !== null) {
    const [r = 0, g = 0, b = 0, a = 1] = (rgba[1] ?? '')
      .split(',')
      .map((part) => Number(part.trim()));
    return [r, g, b, a];
  }
  throw new Error(`not a color: ${value}`);
}

function token(name: string): Rgba {
  const match = new RegExp(`${name}:\\s*([^;]+);`, 'u').exec(ROOT_BLOCK);
  if (match === null) {
    throw new Error(`missing token ${name}`);
  }
  return parseColor((match[1] ?? '').trim());
}

function color(ref: string): Rgba {
  return ref.startsWith('--') ? token(ref) : parseColor(ref);
}

function over(top: Rgba, below: Rgba): Rgba {
  const a = top[3];
  return [
    top[0] * a + below[0] * (1 - a),
    top[1] * a + below[1] * (1 - a),
    top[2] * a + below[2] * (1 - a),
    1,
  ];
}

function flatten(layers: readonly string[]): Rgba {
  let result: Rgba = [0, 0, 0, 1];
  for (const layer of layers) {
    result = over(color(layer), result);
  }
  return result;
}

function luminance([r, g, b]: Rgba): number {
  const channel = (value: number): number => {
    const unit = value / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: Rgba, b: Rgba): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const BLACK = '#000000';
const GLOW = '#6a3c10';
const SUN = '#ffd27a';
const GLASS = [BLACK, '--c-surface'];
const SEGMENTS = [...GLASS, 'rgba(255, 255, 255, 0.06)'];
const INFO_TINT = [...GLASS, 'rgba(140, 200, 255, 0.08)'];
const TRACK = [...GLASS, 'rgba(255, 255, 255, 0.05)'];

type Pair = {
  name: string;
  fg: string;
  bg: readonly string[];
  min: 4.5 | 3;
};

const PAIRS: readonly Pair[] = [
  { name: 'text on glass', fg: '--c-text', bg: GLASS, min: 4.5 },
  {
    name: 'text on glass over glow',
    fg: '--c-text',
    bg: [GLOW, '--c-surface'],
    min: 4.5,
  },
  { name: 'text 2 on glass', fg: '--c-text-2', bg: GLASS, min: 4.5 },
  {
    name: 'text 2 on glass over glow',
    fg: '--c-text-2',
    bg: [GLOW, '--c-surface'],
    min: 4.5,
  },
  {
    name: 'text 2 on light panel over glow',
    fg: '--c-text-2',
    bg: [GLOW, '--c-surface-solid'],
    min: 4.5,
  },
  {
    name: 'text on light panel over the Sun',
    fg: '--c-text',
    bg: [SUN, '--c-surface-solid'],
    min: 4.5,
  },
  { name: 'text 2 on segments', fg: '--c-text-2', bg: SEGMENTS, min: 4.5 },
  {
    name: 'text on active segment',
    fg: '--c-text',
    bg: [...SEGMENTS, '--c-surface-active'],
    min: 4.5,
  },
  {
    name: 'text on hover',
    fg: '--c-text',
    bg: [...GLASS, '--c-surface-hover'],
    min: 4.5,
  },
  { name: 'ink on accent', fg: '--c-accent-ink', bg: ['--c-accent'], min: 4.5 },
  {
    name: 'ink on accent hover',
    fg: '--c-accent-ink',
    bg: ['--c-accent-hover'],
    min: 4.5,
  },
  {
    name: 'ink on accent pressed',
    fg: '--c-accent-ink',
    bg: ['--c-accent-pressed'],
    min: 4.5,
  },
  {
    name: 'text in the dialog over the scrim',
    fg: '--c-text',
    bg: [BLACK, '--c-scrim', '--c-surface-strong'],
    min: 4.5,
  },
  { name: 'fun fact text', fg: '--c-text', bg: INFO_TINT, min: 4.5 },
  { name: 'fun fact heading', fg: '--c-info', bg: INFO_TINT, min: 4.5 },
  { name: 'mint on glass', fg: '--c-on', bg: GLASS, min: 4.5 },
  { name: 'ink on mint', fg: '--c-on-ink', bg: ['--c-on'], min: 4.5 },
  { name: 'focus on glass', fg: '--c-focus', bg: GLASS, min: 3 },
  { name: 'focus on the scene', fg: '--c-focus', bg: ['--c-space'], min: 3 },
  {
    name: 'control border on glass',
    fg: '--c-control-border',
    bg: GLASS,
    min: 3,
  },
  { name: 'accent line on glass', fg: '--c-accent', bg: GLASS, min: 3 },
  { name: 'switch on', fg: '--c-on', bg: GLASS, min: 3 },
  { name: 'slider thumb', fg: '#ffffff', bg: GLASS, min: 3 },
  { name: 'slider fill on track', fg: '--c-text-2', bg: ['#48536f'], min: 3 },
  { name: 'approximate positions outline', fg: '--c-warn', bg: GLASS, min: 3 },
  { name: 'gauge Earth', fg: '--c-earth', bg: TRACK, min: 3 },
  { name: 'gauge Earth outline', fg: '--c-earth-outline', bg: TRACK, min: 3 },
  { name: 'gauge Mercury', fg: '#9c9c9c', bg: TRACK, min: 3 },
  { name: 'gauge Jupiter', fg: '#d2a679', bg: TRACK, min: 3 },
  { name: 'gauge Saturn', fg: '#e3cc8f', bg: TRACK, min: 3 },
];

test('contrast pairs from contrast.md', () => {
  for (const pair of PAIRS) {
    const background = flatten(pair.bg);
    const foreground = over(color(pair.fg), background);
    expect(ratio(foreground, background), pair.name).toBeGreaterThanOrEqual(
      pair.min,
    );
  }

  // Pairs whose foreground is translucent over its own background.
  const segments = flatten(SEGMENTS);
  expect(
    ratio(over(color('--c-active-border'), segments), segments),
  ).toBeGreaterThanOrEqual(3);
  const jupiter = color('#d2a679');
  expect(
    ratio(over(color('rgba(0, 0, 0, 0.75)'), jupiter), jupiter),
  ).toBeGreaterThanOrEqual(3);
});
