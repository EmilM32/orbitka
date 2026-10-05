import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

const css = readFileSync('src/ui/timeControls.css', 'utf8');

test('timeControlsCss › rules', () => {
  expect(css).toContain('min-width: 44px');
  expect(css).toContain('min-height: 44px');
  expect(css).toContain('touch-action: manipulation');
  expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid #ffd54a/u);
  expect(css).toContain('flex-wrap: wrap');
  expect(css).toContain('width: max-content');
  expect(css).toContain('max-width: calc(100vw - 16px)');

  const hidden = css.match(/\.visually-hidden\s*\{[^}]*\}/u);
  expect(hidden).not.toBeNull();
  expect(hidden?.[0]).not.toContain('display: none');
  expect(css).not.toContain('@import');
  expect(css).not.toContain('url(http');
});
