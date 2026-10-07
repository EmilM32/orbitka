import { readdirSync, readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

const css = readFileSync('src/ui/scaleNotice.css', 'utf8');
const debugCss = readFileSync('src/ui/debugOverlay.css', 'utf8');

test('scaleNoticeCss › rules', () => {
  expect(css).toContain('min-width: 44px');
  expect(css).toContain('min-height: 44px');
  expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid #ffd54a/u);
  expect(css).toContain('max-width: min(420px, calc(100vw - 16px))');
  expect(css).toContain(
    'max-height: calc(100vh - 60px - var(--time-panel-height, 0px) - 16px - 16px)',
  );
  // Only the text scrolls; the close button sits below it, always in view.
  expect(css).toMatch(/#scale-explanation\s*\{[^}]*overflow:\s*hidden/u);
  expect(css).toMatch(/\.scale-explanation-body\s*\{[^}]*overflow-y:\s*auto/u);
  expect(css).toMatch(/#scale-close\s*\{[^}]*flex:\s*0 0 auto/u);
  expect(css).toMatch(/#scale-explanation\s*\{[^}]*background:\s*#0a0e1e/u);
  expect(css).toMatch(
    /#scale-notice\.is-open\s*\{[^}]*z-index:\s*var\(--layer-dialog\)/u,
  );
  expect(css).toContain('max-width: calc(100vw - 16px - 52px)');
  expect(debugCss).toContain('--debug-top: calc(8px + 44px + 8px)');

  const sizes = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/gu)].map(
    (match) => Number(match[1]),
  );
  expect(sizes.length).toBeGreaterThan(0);
  for (const size of sizes) {
    expect(size).toBeGreaterThanOrEqual(12);
  }

  expect(css).not.toContain('@import');
  expect(css).not.toContain('url(http');
});

test('scaleNoticeCss › every z-index uses a shared layer', () => {
  const global = readFileSync('src/style.css', 'utf8');
  const layers = new Map<string, number>();
  for (const match of global.matchAll(/--layer-([a-z]+):\s*(\d+);/gu)) {
    layers.set(match[1] ?? '', Number(match[2]));
  }
  expect([...layers.keys()]).toEqual([
    'overlay',
    'debug',
    'panel',
    'drawer',
    'dialog',
  ]);
  const values = [...layers.values()];
  expect(Math.max(...values)).toBe(layers.get('dialog'));
  expect(layers.get('drawer')).toBeGreaterThan(layers.get('panel') ?? 0);

  const sheets = readdirSync('src/ui')
    .filter((name) => name.endsWith('.css'))
    .map((name) => `src/ui/${name}`)
    .concat('src/style.css');
  let count = 0;
  for (const path of sheets) {
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/z-index:\s*([^;]+);/gu)) {
      count += 1;
      const value = match[1] ?? '';
      expect(value, path).toMatch(/^var\(--layer-[a-z]+\)$/u);
      expect(layers.has(value.slice('var(--layer-'.length, -1)), path).toBe(
        true,
      );
    }
  }
  expect(count).toBeGreaterThan(5);
});
