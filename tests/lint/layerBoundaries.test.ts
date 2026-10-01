import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { expect, test } from 'vitest';

const BOUNDARY_RULES = new Set([
  'no-restricted-globals',
  'no-restricted-imports',
  'no-restricted-properties',
  'no-restricted-syntax',
  'orbitka/index-reexports-only',
  'orbitka/no-dynamic-module-path',
  'orbitka/no-relative-outside-layer',
]);

// Expected ADR-002 matrix (EMI-139), stored independently of eslint.config.js.
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
    throw new Error(`ESLint returned no result for ${filePath}`);
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
  ['an .mts test', 'tests/sim/x.test.mts', `import 'three';\n`],
  ['a .js file in tests', 'tests/sim/x.js', `import 'three';\n`],
  ['an e2e test', 'tests/e2e/x.spec.ts', `import 'three';\n`],
  [
    'an import type',
    'src/sim/x.ts',
    `export type S = import('three').Scene;\n`,
  ],
  [
    'a typeof import type',
    'src/ui/x.ts',
    `export type T = typeof import('three');\n`,
  ],
  [
    'an import type in a test',
    'tests/sim/x.test.ts',
    `export type S = import('three').Scene;\n`,
  ],
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
  ['an .mjs file', 'src/content/x.mjs', `import '@core/x.ts';\n`],
  ['a .cjs file', 'src/content/x.cjs', `import '@core/x.ts';\n`],
  ['a .tsx file', 'src/content/x.tsx', `import '@core/x.ts';\n`],
  ['a .jsx file', 'src/content/x.jsx', `import '@core/x.ts';\n`],
  [
    'an import type',
    'src/ui/x.ts',
    `export type X = import('@render/a.ts').A;\n`,
  ],
  [
    'a typeof import type',
    'src/sim/x.ts',
    `export type X = typeof import('@core/a.ts');\n`,
  ],
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
  [
    'a re-export of everything',
    'src/sim/x.ts',
    `export * from '../render/x.ts';\n`,
  ],
  [
    'a named re-export',
    'src/sim/x.ts',
    `export { a } from '../render/x.ts';\n`,
  ],
  [
    'a template literal import',
    'src/core/x.ts',
    'export const load = () => import(`../ui/x.ts`);\n',
  ],
  ['a test into src', 'tests/sim/x.test.ts', `import '../../src/sim/x.ts';\n`],
  [
    'an import type',
    'src/ui/x.ts',
    `export type X = import('../render/a.ts').A;\n`,
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
  [
    'a template literal import',
    'src/sim/x.ts',
    'export const load = () => import(`./scale.ts`);\n',
  ],
  ['a test helper', 'tests/e2e/x.spec.ts', `import './helpers.ts';\n`],
  [
    'an import type',
    'src/sim/x.ts',
    `export type V = import('./scale.ts').Vec3;\n`,
  ],
  [
    'a directory outside the layers to the src root',
    'src/types/x.ts',
    `import '../main.ts';\n`,
  ],
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
  [
    'an import type of three in render',
    'src/render/x.ts',
    `export type S = import('three').Scene;\n`,
  ],
  [
    'an import type of an allowed layer',
    'src/core/x.ts',
    `export type V = import('@sim/scale.ts').Vec3;\n`,
  ],
  ['a layer path ending in three', 'src/sim/x.ts', `import '@data/three';\n`],
  ['a package starting with three', 'src/sim/x.ts', `import 'threejs-foo';\n`],
  [
    'a JSON import',
    'src/data/x.ts',
    `import raw from './bodies.json' with { type: 'json' };\nexport default raw;\n`,
  ],
  [
    'import.meta.env',
    'src/core/x.ts',
    'export const dev = import.meta.env.DEV;\n',
  ],
  [
    'import.meta.hot in the entry module',
    'src/main.ts',
    'if (import.meta.hot) {\n  import.meta.hot.accept();\n}\n',
  ],
])('no false positive for %s', async (_kind, filePath, code) => {
  expect(await boundaryErrors(filePath, code)).toEqual([]);
});

test.each(forbiddenLayerImports)(
  'tests/%s cannot import @%s',
  async (layer, other) => {
    const errors = await boundaryErrors(
      `tests/${layer}/x.test.ts`,
      `import '@${other}/x.ts';\n`,
    );

    expect(errors).toHaveLength(1);
  },
);

test.each([
  ...allowedLayerImports,
  ...layers.map((layer) => [layer, layer] as const),
])('tests/%s can import @%s', async (layer, other) => {
  const errors = await boundaryErrors(
    `tests/${layer}/x.test.ts`,
    `import '@${other}/x.ts';\n`,
  );

  expect(errors).toEqual([]);
});

test.each(layers)(
  'a test outside tests/<layer> cannot import @%s',
  async (layer) => {
    const errors = await boundaryErrors(
      'tests/lint/x.test.ts',
      `import '@${layer}/x.ts';\n`,
    );

    expect(errors).toHaveLength(1);
  },
);

test.each(['tests/x.test.ts', 'tests/e2e/x.spec.ts'])(
  '%s cannot import a layer',
  async (filePath) => {
    expect(
      await boundaryErrors(filePath, `import '@data/x.ts';\n`),
    ).toHaveLength(1);
  },
);

test.each([
  [
    'src',
    'src/sim/x.ts',
    'export const load = (name: string) => import(name);\n',
  ],
  [
    'a template literal with an expression',
    'src/core/x.ts',
    'export const load = (name: string) => import(`@sim/${name}`);\n',
  ],
  [
    'the entry module',
    'src/main.ts',
    'export const load = (name: string) => import(name);\n',
  ],
  [
    'a test',
    'tests/sim/x.test.ts',
    'export const load = (name: string) => import(name);\n',
  ],
])(
  'import() with a computed path is rejected in %s',
  async (_kind, filePath, code) => {
    expect(await boundaryErrors(filePath, code)).toHaveLength(1);
  },
);

test.each([
  ['src', 'src/sim/x.ts', `export const all = import.meta.glob('./*.ts');\n`],
  [
    'a computed property',
    'src/sim/x.ts',
    `export const all = import.meta['glob']('./*.ts');\n`,
  ],
  [
    'the entry module',
    'src/main.ts',
    `export const all = import.meta.glob('./*.ts');\n`,
  ],
  [
    'a test',
    'tests/data/x.test.ts',
    `export const all = import.meta.glob('./*.ts');\n`,
  ],
])('import.meta.glob is rejected in %s', async (_kind, filePath, code) => {
  expect(await boundaryErrors(filePath, code)).toHaveLength(1);
});

test.each([
  ['a call', 'src/core/x.ts', 'requestAnimationFrame(() => {});\n'],
  [
    'a window property',
    'src/render/x.ts',
    'window.requestAnimationFrame(() => {});\n',
  ],
  [
    'destructuring',
    'src/ui/x.ts',
    'const { requestAnimationFrame: raf } = window;\nraf(() => {});\n',
  ],
  [
    'a file outside the layers',
    'src/x.ts',
    'requestAnimationFrame(() => {});\n',
  ],
])('requestAnimationFrame is rejected in %s', async (_kind, filePath, code) => {
  expect(await boundaryErrors(filePath, code)).toHaveLength(1);
});

test.each([
  ['the entry module', 'src/main.ts'],
  ['an e2e test', 'tests/e2e/x.spec.ts'],
])('requestAnimationFrame passes in %s', async (_kind, filePath) => {
  expect(
    await boundaryErrors(filePath, 'requestAnimationFrame(() => {});\n'),
  ).toEqual([]);
});

test.each([
  ['a relative import', 'src/sim/x.ts', `import './scale.js';\n`],
  [
    'a parent inside the layer',
    'src/sim/orbits/x.ts',
    `import '../scale.js';\n`,
  ],
  ['an alias import', 'src/sim/x.ts', `import '@data/bodies.js';\n`],
  ['a re-export', 'src/sim/x.ts', `export * from './scale.js';\n`],
  [
    'a dynamic import',
    'src/sim/x.ts',
    `export const load = () => import('./scale.js');\n`,
  ],
  ['the entry module', 'src/main.ts', `import '@core/loop.js';\n`],
  ['a layer test', 'tests/sim/x.test.ts', `import '@sim/scale.js';\n`],
  ['an e2e test', 'tests/e2e/x.spec.ts', `import './helpers.js';\n`],
  [
    'an import type',
    'src/sim/x.ts',
    `export type V = import('./scale.js').Vec3;\n`,
  ],
])('a .js extension is rejected in %s', async (_kind, filePath, code) => {
  expect(await boundaryErrors(filePath, code)).toHaveLength(1);
});

test('an index file may re-export', async () => {
  const code = [
    `export * from './scale.ts';`,
    `export { solveKepler } from './kepler.ts';`,
    `export type { Vec3 } from './scale.ts';`,
    '',
  ].join('\n');

  expect(await boundaryErrors('src/sim/index.ts', code)).toEqual([]);
});

test.each([
  [
    'a function',
    'src/sim/index.ts',
    'export function f(): number {\n  return 1;\n}\n',
  ],
  ['a constant', 'src/core/index.ts', 'export const x = 1;\n'],
  ['an import', 'src/data/index.ts', `import './types.ts';\n`],
  ['a statement', 'src/ui/index.ts', 'console.log(1);\n'],
  ['a .js index', 'src/render/index.js', 'export const x = 1;\n'],
  ['an index outside the layers', 'src/index.ts', 'export const x = 1;\n'],
])('an index file is rejected with %s', async (_kind, filePath, code) => {
  expect(await boundaryErrors(filePath, code)).toHaveLength(1);
});
