import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

const css = readFileSync('src/ui/scaleNotice.css', 'utf8');
const debugCss = readFileSync('src/ui/debugOverlay.css', 'utf8');

test('scaleNoticeCss › rules', () => {
  expect(css).toContain('min-width: 44px');
  expect(css).toContain('min-height: 44px');
  expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid #ffd54a/u);
  expect(css).toContain('max-width: min(420px, calc(100vw - 16px))');
  expect(css).toContain('max-height: 60vh');
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
