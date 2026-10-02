import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = join(ROOT, 'src');
const LOCALES = `content${sep}locales`;
const POLISH_LETTERS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/u;

function containsPolish(text: string): boolean {
  return POLISH_LETTERS.test(text);
}

function isScanned(fromSrc: string): boolean {
  if (fromSrc.endsWith('.ts')) {
    return true;
  }

  return fromSrc.startsWith(`data${sep}`) && fromSrc.endsWith('.json');
}

function sourceFiles(): string[] {
  const found: string[] = [];

  function walk(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const fromSrc = relative(SRC, path);
      if (fromSrc === LOCALES || fromSrc.startsWith(`${LOCALES}${sep}`)) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(path);
        continue;
      }

      if (isScanned(fromSrc)) {
        found.push(path);
      }
    }
  }

  walk(SRC);
  return found;
}

function polishHits(): string[] {
  const hits: string[] = [];
  for (const file of sourceFiles()) {
    if (containsPolish(readFileSync(file, 'utf8'))) {
      hits.push(relative(ROOT, file));
    }
  }
  return hits;
}

test('repo › polish letter detector', () => {
  expect(containsPolish('ą')).toBe(true);
  expect(containsPolish('const label = "Pause";')).toBe(false);
});

test('repo › no Polish in code', () => {
  expect(polishHits()).toEqual([]);
});
