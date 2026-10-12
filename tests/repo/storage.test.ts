import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

// EMI-245: the browser storages are named in one place (`src/app/storage.ts`,
// the injection source); the access rules live in `src/core/storage.ts`.

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = join(ROOT, 'src');
const ALLOWED = new Set([`app${sep}storage.ts`, `core${sep}storage.ts`]);
const RAW_STORAGE = /\b(?:localStorage|sessionStorage)\b/u;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

test('only the storage modules mention localStorage or sessionStorage', () => {
  const offenders = sourceFiles(SRC)
    .filter((path) => !ALLOWED.has(relative(SRC, path)))
    .filter((path) => RAW_STORAGE.test(readFileSync(path, 'utf8')))
    .map((path) => relative(SRC, path));
  expect(offenders).toEqual([]);
});
