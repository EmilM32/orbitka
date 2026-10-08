import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };

const ARIA_LABEL =
  'Widok 3D Układu Słonecznego. Strzałki obracają, plus i minus przybliżają.';

test('pl.json canvas label', () => {
  const messages: Record<string, unknown> = pl;
  expect(messages['canvas.ariaLabel']).toBe(ARIA_LABEL);

  const css = readFileSync(
    new URL('../../src/style.css', import.meta.url),
    'utf8',
  );
  expect(css).toContain('#viewport:focus-visible');
  expect(css).toContain('outline: 2px solid var(--c-focus)');
  expect(css).toContain('outline-offset: -2px');
});
