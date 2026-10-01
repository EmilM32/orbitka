import path from 'node:path';

import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const SOURCE_EXTENSIONS = '{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const SRC_DIR = path.join(import.meta.dirname, 'src');

// Layer dependency matrix (ADR-002): a layer imports only the layers listed here.
const allowedLayers = {
  data: [],
  sim: ['data'],
  core: ['data', 'sim'],
  content: ['data'],
  render: ['core', 'sim', 'data'],
  ui: ['core', 'data', 'content'],
};

const layers = Object.keys(allowedLayers);

const boundaries = layers.map((layer) => ({
  layer,
  files: [`src/${layer}/**/*.${SOURCE_EXTENSIONS}`],
  allowThree: layer === 'render',
  forbidden: layers
    .filter((other) => other !== layer && !allowedLayers[layer].includes(other))
    .map((other) => `@${other}`),
}));

// No "/" in the expression, because an esquery selector ends the regex at the first "/".
function moduleRegex(names) {
  return `^(?:${names.join('|')})(?:\\x2F.*)?$`;
}

function restrictedImports(restrictions) {
  return {
    'no-restricted-imports': ['error', { patterns: restrictions }],
    'no-restricted-syntax': [
      'error',
      ...restrictions.flatMap(({ regex, message }) => [
        {
          selector: `ImportExpression[source.value=/${regex}/]`,
          message,
        },
        {
          selector: `ImportExpression[source.quasis.0.value.cooked=/${regex}/]`,
          message,
        },
      ]),
    ],
  };
}

const threeRestriction = {
  regex: moduleRegex(['three']),
  message: 'three may be imported only in src/render and tests/render.',
};

function zoneOf(file) {
  const relative = path.relative(SRC_DIR, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  const [first, ...rest] = relative.split(path.sep);
  return rest.length > 0 && layers.includes(first) ? first : '';
}

const noRelativeOutsideLayer = {
  meta: {
    type: 'problem',
    messages: {
      outside:
        'Import "{{source}}" crosses a layer boundary. Import across layers through an alias (@sim/…, @core/…).',
    },
    schema: [],
  },
  create(context) {
    const zone = zoneOf(context.filename);

    const check = (source) => {
      if (
        source?.type !== 'Literal' ||
        typeof source.value !== 'string' ||
        !source.value.startsWith('.')
      ) {
        return;
      }

      const target = path.resolve(path.dirname(context.filename), source.value);
      if (zoneOf(target) !== zone) {
        context.report({
          node: source,
          messageId: 'outside',
          data: { source: source.value },
        });
      }
    };

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
    };
  },
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  tseslint.configs.recommended,
  {
    files: [`src/**/*.${SOURCE_EXTENSIONS}`],
    plugins: {
      orbitka: {
        rules: { 'no-relative-outside-layer': noRelativeOutsideLayer },
      },
    },
    rules: {
      'orbitka/no-relative-outside-layer': 'error',
      ...restrictedImports([threeRestriction]),
    },
  },
  ...boundaries.map(({ layer, files, allowThree, forbidden }) => ({
    files,
    rules: restrictedImports([
      ...(allowThree ? [] : [threeRestriction]),
      {
        regex: moduleRegex(forbidden),
        message: `src/${layer} does not import ${forbidden.join(', ')} (ADR-002 dependency matrix).`,
      },
    ]),
  })),
  {
    files: [`tests/**/*.${SOURCE_EXTENSIONS}`],
    ignores: ['tests/render/**'],
    rules: restrictedImports([threeRestriction]),
  },
  eslintConfigPrettier,
);
