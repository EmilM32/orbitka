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
  // The dialog: 580 px, never wider than the window minus 32 px, centered.
  expect(css).toMatch(
    /#scale-explanation\s*\{[^}]*width:\s*min\(36\.25rem, 100vw - 32px\)/u,
  );
  expect(css).toMatch(
    /#scale-explanation\s*\{[^}]*max-height:\s*calc\(100dvh - 32px\)/u,
  );
  expect(css).toMatch(/#scale-explanation\s*\{[^}]*margin:\s*auto/u);
  expect(css).toMatch(
    /#scale-explanation\s*\{[^}]*z-index:\s*var\(--z-dialog\)/u,
  );
  // Only the points scroll; the footer with "Rozumiem" is always in view.
  expect(css).toMatch(/#scale-explanation\s*\{[^}]*overflow:\s*hidden/u);
  expect(css).toMatch(/\.scale-explanation-body\s*\{[^}]*overflow-y:\s*auto/u);
  expect(css).toMatch(/\.scale-explanation-foot\s*\{[^}]*flex:\s*0 0 auto/u);
  // 220 ms fade and scale .98 → 1; reduced motion keeps only the fade.
  expect(css).toMatch(
    /#scale-explanation\s*\{[^}]*animation:\s*scale-dialog-in var\(--dur\) var\(--ease-out\)/u,
  );
  expect(css).toMatch(
    /@keyframes scale-dialog-in\s*\{\s*from\s*\{\s*opacity:\s*0;\s*transform:\s*scale\(0\.98\);/u,
  );
  expect(css).toMatch(
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*#scale-explanation\s*\{\s*animation-name:\s*scale-fade;/u,
  );
  // The dialog is no longer lifted through the top bar.
  expect(headerCss).not.toContain('is-open');
  expect(debugCss).toContain('--debug-top: calc(8px + 44px + 8px)');

  const sizes = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/gu)].map(
    (match) => Number(match[1]),
  );
  for (const size of sizes) {
    expect(size).toBeGreaterThanOrEqual(12);
  }

  expect(css).not.toContain('@import');
  expect(css).not.toContain('url(http');
});

test('scaleNoticeCss › scrim has no blur', () => {
  const scrim = css.match(/\.scrim\s*\{[^}]*\}/u)?.[0] ?? '';
  expect(scrim).toContain('background: var(--c-scrim)');
  expect(scrim).toContain('z-index: var(--z-scrim)');
  expect(scrim).toContain('animation: scale-fade var(--dur) var(--ease-out)');
  expect(scrim).not.toContain('backdrop-filter');
  expect(tokensCss).toContain('--c-scrim: rgba(3, 5, 10, 0.62);');
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
