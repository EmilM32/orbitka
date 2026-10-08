import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TEXTURES = join(ROOT, 'public', 'assets', 'textures');
const RESOLUTIONS = ['512', '1k', '2k'] as const;
const MAX_TOTAL_BYTES = 6_000_000;

function textureFiles(): string[] {
  return readdirSync(TEXTURES, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      join(entry.parentPath, entry.name)
        .slice(TEXTURES.length + 1)
        .split('\\')
        .join('/'),
    )
    .sort();
}

// Read as plain JSON: a repo test imports no layer module (ADR-002).
const bodies = JSON.parse(
  readFileSync(join(ROOT, 'src', 'data', 'bodies.json'), 'utf8'),
) as { visual: { texture: string | null } }[];
const keys = bodies.flatMap((body) =>
  body.visual.texture === null ? [] : [body.visual.texture],
);

test('assets › every texture key has a file per resolution', () => {
  expect(keys.length).toBeGreaterThan(0);
  const files = new Set(textureFiles());

  for (const key of keys) {
    for (const resolution of RESOLUTIONS) {
      expect(
        files.has(`${resolution}/${key}.jpg`),
        `${resolution}/${key}.jpg`,
      ).toBe(true);
    }
  }
});

test('assets › no texture file without a key in the data', () => {
  const expected = RESOLUTIONS.flatMap((resolution) =>
    keys.map((key) => `${resolution}/${key}.jpg`),
  ).sort();

  expect(textureFiles()).toEqual(expected);
});

test('assets › every texture file is in ATTRIBUTION.md', () => {
  const attribution = readFileSync(join(ROOT, 'ATTRIBUTION.md'), 'utf8');

  for (const file of textureFiles()) {
    expect(attribution, file).toContain(`\`${file}\``);
  }
  expect(attribution).toContain('## Planet textures');
  expect(attribution).toContain('Solar System Scope');
  expect(attribution).toContain('https://creativecommons.org/licenses/by/4.0/');
});

test('assets › textures stay within 6 MB', () => {
  let total = 0;
  for (const file of textureFiles()) {
    total += statSync(join(TEXTURES, file)).size;
  }

  expect(total).toBeLessThanOrEqual(MAX_TOTAL_BYTES);
});
