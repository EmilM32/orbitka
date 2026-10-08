import { readdirSync, readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

const css = readFileSync('src/ui/scaleNotice.css', 'utf8');
const headerCss = readFileSync('src/ui/pageHeader.css', 'utf8');
const tokensCss = readFileSync('src/ui/tokens.css', 'utf8');
const debugCss = readFileSync('src/ui/debugOverlay.css', 'utf8');

test('scaleNoticeCss › rules', () => {
  expect(css).toMatch(/#scale-why\s*\{[^}]*min-width:\s*var\(--hit\)/u);
  // 44 px on the tablet and on touch screens.
  expect(css).toMatch(
    /@media \(max-width: 1024px\), \(pointer: coarse\)\s*\{\s*#scale-why\s*\{[^}]*min-height:\s*var\(--hit\)/u,
  );
  expect(tokensCss).toContain('--hit: 2.75rem;');
  // The chip text is at least 14 px (--fs-sm).
  expect(css).toMatch(/#scale-badge\s*\{[^}]*font-size:\s*var\(--fs-sm\)/u);
  expect(tokensCss).toContain('--fs-sm: 0.875rem;');
  // Focus is the global ring from controls.css (EMI-217), never yellow.
  expect(css).not.toContain('focus-visible');
  expect(css).not.toContain('#ffd54a');
  expect(css).toContain('max-width: min(420px, calc(100vw - 16px))');
  expect(css).toContain(
    'max-height: calc(100vh - 60px - var(--time-panel-height, 0px) - 16px - 16px)',
  );
  // Only the text scrolls; the close button sits below it, always in view.
  expect(css).toMatch(/#scale-explanation\s*\{[^}]*overflow:\s*hidden/u);
  expect(css).toMatch(/\.scale-explanation-body\s*\{[^}]*overflow-y:\s*auto/u);
  expect(css).toMatch(/#scale-close\s*\{[^}]*flex:\s*0 0 auto/u);
  expect(css).toMatch(/#scale-explanation\s*\{[^}]*background:\s*#0a0e1e/u);
  expect(headerCss).toMatch(
    /\.topbar:has\(#scale-notice\.is-open\)\s*\{[^}]*z-index:\s*var\(--z-dialog\)/u,
  );
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
  const layers = new Map<string, number>();
  for (const match of tokensCss.matchAll(/--z-([a-z]+):\s*(\d+);/gu)) {
    layers.set(match[1] ?? '', Number(match[2]));
  }
  // SPEC §4, from the scene up to the toast.
  expect([...layers.keys()]).toEqual([
    'scene',
    'labels',
    'panels',
    'card',
    'dock',
    'drawer',
    'coach',
    'tooltip',
    'scrim',
    'dialog',
    'toast',
  ]);
  const values = [...layers.values()];
  expect(values).toEqual(values.toSorted((a, b) => a - b));

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
      expect(value, path).toMatch(/^var\(--z-[a-z]+\)$/u);
      expect(layers.has(value.slice('var(--z-'.length, -1)), path).toBe(true);
    }
  }
  expect(count).toBeGreaterThan(5);
});
