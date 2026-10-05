import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = join(ROOT, 'src');
const LOCALES = `content${sep}locales`;
const POLISH_LETTERS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/u;
// Files outside src that hold code or markup.
const ROOT_FILES = ['index.html'];

function containsPolish(text: string): boolean {
  return POLISH_LETTERS.test(text);
}

function isScanned(fromSrc: string): boolean {
  if (fromSrc.endsWith('.ts') || fromSrc.endsWith('.css')) {
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
  return [...found, ...ROOT_FILES.map((file) => join(ROOT, file))];
}

function polishHits(
  files: readonly string[],
  read: (file: string) => string,
): string[] {
  return files
    .filter((file) => containsPolish(read(file)))
    .map((file) => relative(ROOT, file).split(sep).join('/'));
}

test('repo › polish letter detector', () => {
  expect(containsPolish('ą')).toBe(true);
  expect(containsPolish('const label = "Pause";')).toBe(false);
});

test('repo › scans code, stylesheets, data, and index.html', () => {
  const scanned = sourceFiles().map((file) =>
    relative(ROOT, file).split(sep).join('/'),
  );

  expect(scanned).toContain('index.html');
  expect(scanned).toContain('src/main.ts');
  expect(scanned).toContain('src/style.css');
  expect(scanned).toContain('src/ui/scaleNotice.css');
  expect(scanned).toContain('src/data/bodies.json');
  expect(scanned).not.toContain('src/content/locales/pl.json');
});

test('repo › Polish in a stylesheet or index.html is reported', () => {
  const texts = new Map([
    [join(ROOT, 'src/ui/x.css'), '.badge::after { content: "Zamknij ą"; }'],
    [join(ROOT, 'index.html'), '<title>Układ Słoneczny</title>'],
    [join(ROOT, 'src/ui/y.css'), '.badge { color: red; }'],
  ]);

  expect(
    polishHits([...texts.keys()], (file) => texts.get(file) ?? ''),
  ).toEqual(['src/ui/x.css', 'index.html']);
});

test('repo › no Polish in code', () => {
  expect(
    polishHits(sourceFiles(), (file) => readFileSync(file, 'utf8')),
  ).toEqual([]);
});
