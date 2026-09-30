import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { expect, test } from 'vitest';

const BOUNDARY_RULES = new Set([
  'no-restricted-imports',
  'no-restricted-syntax',
  'orbitka/no-relative-outside-layer',
]);

// Oczekiwana macierz z ADR-002 (EMI-139), zapisana niezależnie od eslint.config.js.
const allowedLayers: Record<string, readonly string[]> = {
  data: [],
  sim: ['data'],
  core: ['data', 'sim'],
  content: ['data'],
  render: ['core', 'sim', 'data'],
  ui: ['core', 'data', 'content'],
};

const layers = Object.keys(allowedLayers);

const eslint = new ESLint({
  cwd: fileURLToPath(new URL('../..', import.meta.url)),
});

async function boundaryErrors(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  if (!result) {
    throw new Error(`ESLint nie zwrócił wyniku dla ${filePath}`);
  }

  expect(result.messages.filter((message) => message.fatal)).toEqual([]);
  return result.messages.filter(
    (message) => message.ruleId !== null && BOUNDARY_RULES.has(message.ruleId),
  );
}

const forbiddenLayerImports = Object.entries(allowedLayers).flatMap(
  ([layer, allowed]) =>
    layers
      .filter((other) => other !== layer && !allowed.includes(other))
      .map((other) => [layer, other] as const),
);

const allowedLayerImports = Object.entries(allowedLayers).flatMap(
  ([layer, allowed]) => allowed.map((other) => [layer, other] as const),
);

test.each(forbiddenLayerImports)(
  'src/%s cannot import @%s',
  async (layer, other) => {
    const errors = await boundaryErrors(
      `src/${layer}/x.ts`,
      `import '@${other}/x.ts';\n`,
    );

    expect(errors).toHaveLength(1);
  },
);

test.each(allowedLayerImports)(
  'src/%s can import @%s',
  async (layer, other) => {
    const errors = await boundaryErrors(
      `src/${layer}/x.ts`,
      `import '@${other}/x.ts';\n`,
    );

    expect(errors).toEqual([]);
  },
);

test.each(layers.filter((layer) => layer !== 'render'))(
  'src/%s cannot import three',
  async (layer) => {
    const errors = await boundaryErrors(
      `src/${layer}/x.ts`,
      `import { Vector3 } from 'three';\nexport const v = new Vector3();\n`,
    );

    expect(errors).toHaveLength(1);
  },
);

test.each([
  [
    'a static import',
    `import { Scene } from 'three';\nexport const s = new Scene();\n`,
  ],
  ['a subpath import', `import 'three/addons/controls/OrbitControls.js';\n`],
  ['a dynamic import', `export const load = () => import('three');\n`],
])('src/render can use %s of three', async (_kind, code) => {
  expect(await boundaryErrors('src/render/x.ts', code)).toEqual([]);
});

test.each([
  [
    'a type-only import',
    'src/core/x.ts',
    `import type { Scene } from 'three';\nexport type S = Scene;\n`,
  ],
  [
    'a subpath import',
    'src/ui/x.ts',
    `import 'three/addons/controls/OrbitControls.js';\n`,
  ],
  [
    'a dynamic import',
    'src/sim/x.ts',
    `export const load = () => import('three');\n`,
  ],
  [
    'a template literal import',
    'src/sim/x.ts',
    'export const load = () => import(`three`);\n',
  ],
  [
    'an .mts file',
    'src/core/x.mts',
    `import * as three from 'three';\nexport default three;\n`,
  ],
  [
    'a .js file',
    'src/sim/x.js',
    `import * as three from 'three';\nexport default three;\n`,
  ],
  ['the entry module', 'src/main.ts', `import 'three';\n`],
  ['a test outside tests/render', 'tests/sim/x.test.ts', `import 'three';\n`],
])('three is rejected in %s', async (_kind, filePath, code) => {
  expect(await boundaryErrors(filePath, code)).toHaveLength(1);
});

test.each([
  [
    'a dynamic import',
    'src/sim/x.ts',
    `export const load = () => import('@render/x.ts');\n`,
  ],
  ['a re-export', 'src/data/x.ts', `export * from '@sim/x.ts';\n`],
  ['a bare alias', 'src/ui/x.ts', `import '@render';\n`],
  ['an .mts file', 'src/content/x.mts', `import '@core/x.ts';\n`],
])('a forbidden layer is rejected in %s', async (_kind, filePath, code) => {
  expect(await boundaryErrors(filePath, code)).toHaveLength(1);
});

test.each([
  ['a sibling layer', 'src/sim/x.ts', `import '../render/x.ts';\n`],
  ['a nested file', 'src/sim/orbits/x.ts', `import '../../ui/x.ts';\n`],
  [
    'a dynamic import',
    'src/core/x.ts',
    `export const load = () => import('../sim/x.ts');\n`,
  ],
  ['the src root', 'src/data/x.ts', `import '../main.ts';\n`],
  ['a path outside src', 'src/data/x.ts', `import '../../aliases.ts';\n`],
  [
    'the entry module into a layer',
    'src/main.ts',
    `import './core/loop.ts';\n`,
  ],
])(
  'a relative import leaving the layer is rejected from %s',
  async (_kind, filePath, code) => {
    expect(await boundaryErrors(filePath, code)).toHaveLength(1);
  },
);

test.each([
  ['a sibling file', 'src/sim/x.ts', `import './scale.ts';\n`],
  [
    'a parent inside the layer',
    'src/sim/orbits/x.ts',
    `import '../scale.ts';\n`,
  ],
  ['a nested child', 'src/render/x.ts', `import './materials/sun.ts';\n`],
  ['the entry module stylesheet', 'src/main.ts', `import './style.css';\n`],
])(
  'a relative import inside the layer passes for %s',
  async (_kind, filePath, code) => {
    expect(await boundaryErrors(filePath, code)).toEqual([]);
  },
);

test.each([
  [
    'the entry module',
    'src/main.ts',
    `import '@core/loop.ts';\nimport '@render/createRenderer.ts';\n`,
  ],
  [
    'a render test',
    'tests/render/x.test.ts',
    `import { Scene } from 'three';\nexport const s = new Scene();\n`,
  ],
  ['a sim test', 'tests/sim/x.test.ts', `import '@sim/x.ts';\n`],
])('no false positive for %s', async (_kind, filePath, code) => {
  expect(await boundaryErrors(filePath, code)).toEqual([]);
});
