import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

test('viewport touch-action', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../../src/style.css', import.meta.url)),
    'utf8',
  );

  expect(css).toMatch(/#viewport\s*\{[^}]*touch-action:\s*none/);
});
