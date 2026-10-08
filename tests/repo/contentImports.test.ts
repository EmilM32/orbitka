import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

// EMI-218: lint lets `ui` import `content`, so this test keeps the content
// JSON in main.ts and allows `ui` only type imports from @content.

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = join(ROOT, 'src');

// Static imports and re-exports with their module path; `type` marks a type-only one.
const STATIC_IMPORT =
  /^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gmu;
// import('...') that is not a `typeof import('...')` type query.
const DYNAMIC_IMPORT = /(?<!typeof\s+)\bimport\s*\(\s*['"]([^'"]+)['"]/gu;

type Source = { path: string; text: string };

function sourceFiles(): Source[] {
  const found: Source[] = [];

  function walk(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.name.endsWith('.ts')) {
        found.push({
          path: relative(ROOT, path).split(sep).join('/'),
          text: readFileSync(path, 'utf8'),
        });
      }
    }
  }

  walk(SRC);
  return found;
}

function violations(sources: readonly Source[]): string[] {
  const found: string[] = [];
  for (const { path, text } of sources) {
    const imports = [
      ...[...text.matchAll(STATIC_IMPORT)].map((match) => ({
        typeOnly: match[1] !== undefined,
        module: match[2] ?? '',
      })),
      ...[...text.matchAll(DYNAMIC_IMPORT)].map((match) => ({
        typeOnly: false,
        module: match[1] ?? '',
      })),
    ];

    for (const { typeOnly, module } of imports) {
      if (module.startsWith('@content/pl/') && path !== 'src/main.ts') {
        found.push(`${path}: ${module}`);
      } else if (
        path.startsWith('src/ui/') &&
        module.startsWith('@content/') &&
        !typeOnly
      ) {
        found.push(`${path}: ${module}`);
      }
    }
  }
  return found;
}

test('repo › only main.ts imports content json', () => {
  const sources = sourceFiles();

  expect(sources.map((source) => source.path)).toContain('src/main.ts');
  expect(violations(sources)).toEqual([]);
});

test('repo › content import detector', () => {
  const sources: Source[] = [
    {
      path: 'src/main.ts',
      text: "import raw from '@content/pl/bodies.json' with { type: 'json' };",
    },
    {
      path: 'src/ui/card.ts',
      text: [
        "import type { BodyContent } from '@content/bodyContent.ts';",
        "type Module = typeof import('@content/locales/pl.json');",
      ].join('\n'),
    },
    {
      path: 'src/ui/bad.ts',
      text: "import { parseBodyContentCatalog } from '@content/bodyContent.ts';",
    },
    {
      path: 'src/ui/badJson.ts',
      text: "import raw from '@content/pl/bodies.json' with { type: 'json' };",
    },
    {
      path: 'src/ui/badDynamic.ts',
      text: "const raw = await import('@content/pl/bodies.json');",
    },
    {
      path: 'src/core/badReexport.ts',
      text: "export { default } from '@content/pl/bodies.json';",
    },
  ];

  expect(violations(sources)).toEqual([
    'src/ui/bad.ts: @content/bodyContent.ts',
    'src/ui/badJson.ts: @content/pl/bodies.json',
    'src/ui/badDynamic.ts: @content/pl/bodies.json',
    'src/core/badReexport.ts: @content/pl/bodies.json',
  ]);
});
