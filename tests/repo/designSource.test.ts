import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

// ADR-010 clarification (EMI-216) and EMI-217: src/ui/tokens.css is the only
// token file, fonts live only in public/assets/fonts, and the mockups in
// docs/design/src reuse both instead of keeping their own copies.

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function filesUnder(directory: string, accept: (name: string) => boolean) {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (accept(entry.name)) {
        found.push(relative(ROOT, path).split(sep).join('/'));
      }
    }
  };
  walk(join(ROOT, directory));
  return found;
}

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

test('docs/design has no tokens, fonts.css or woff2', () => {
  expect(existsSync(join(ROOT, 'docs/design/tokens.css'))).toBe(false);
  expect(existsSync(join(ROOT, 'docs/design/src/fonts.css'))).toBe(false);
  expect(filesUnder('docs/design', (name) => name.endsWith('.woff2'))).toEqual(
    [],
  );
  expect(existsSync(join(ROOT, 'src/ui/tokens.css'))).toBe(true);
  expect(read('src/style.css').startsWith("@import './ui/tokens.css';")).toBe(
    true,
  );
});

test('mockup CSS defines no custom properties in :root', () => {
  const sheets = filesUnder('docs/design/src', (name) => name.endsWith('.css'));
  expect(sheets.length).toBeGreaterThan(0);
  for (const path of sheets) {
    expect(read(path), path).not.toMatch(/:root\s*\{[^}]*--/u);
  }

  const pages = filesUnder('docs/design/src', (name) => name.endsWith('.html'));
  expect(pages.length).toBeGreaterThan(0);
  for (const path of pages) {
    const html = read(path);
    const tokens = html.indexOf('href="../../../src/ui/tokens.css"');
    const app = html.indexOf('href="../../../src/style.css"');
    const own = html.indexOf('href="ui.css"');
    expect(tokens, path).toBeGreaterThan(-1);
    expect(app, path).toBeGreaterThan(tokens);
    expect(own, path).toBeGreaterThan(app);
  }
});

test('src does not import from docs', () => {
  const sources = filesUnder(
    'src',
    (name) => name.endsWith('.ts') || name.endsWith('.css'),
  );
  const reference =
    /(?:\bimport\b[^'";]*['"]|@import\s+['"]|url\(\s*['"]?)([^'")]+)/gu;
  for (const path of sources) {
    for (const match of read(path).matchAll(reference)) {
      expect(match[1] ?? '', path).not.toMatch(/(?:^|\/)docs\//u);
    }
  }
});

test('@font-face urls are absolute /assets/fonts', () => {
  const css = read('src/style.css');
  const faces = [...css.matchAll(/@font-face\s*\{[^}]*\}/gu)].map(
    (match) => match[0],
  );
  expect(faces).toHaveLength(6);
  for (const face of faces) {
    expect(face).toContain('font-display: swap');
    expect(face).toContain('unicode-range:');
    const urls = [...face.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gu)].map(
      (match) => match[1] ?? '',
    );
    expect(urls).toHaveLength(1);
    for (const url of urls) {
      expect(url).toMatch(/^\/assets\/fonts\/[a-z0-9-]+\.woff2$/u);
      expect(existsSync(join(ROOT, 'public', url)), url).toBe(true);
    }
  }

  const fonts = filesUnder('public/assets/fonts', (name) =>
    name.endsWith('.woff2'),
  );
  expect(fonts).toHaveLength(6);
  expect(read('index.html')).toContain(
    '<link\n      rel="preload"\n      href="/assets/fonts/inter-latin-400-normal.woff2"\n      as="font"\n      type="font/woff2"\n      crossorigin\n    />',
  );
});

test('every font family has an OFL file', () => {
  for (const file of ['OFL-inter.txt', 'OFL-space-grotesk.txt']) {
    const license = read(`public/assets/fonts/${file}`);
    expect(license, file).toContain('SIL OPEN FONT LICENSE');
  }
  const attribution = read('ATTRIBUTION.md');
  expect(attribution).toContain('Inter');
  expect(attribution).toContain('Space Grotesk');
  expect(attribution).toContain('OFL 1.1');
  expect(attribution).toContain('Lucide');
  expect(attribution).toContain('ISC');
});
