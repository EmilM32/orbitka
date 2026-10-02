import path from 'node:path';

import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const SOURCE_EXTENSIONS = '{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const SRC_DIR = path.join(import.meta.dirname, 'src');

// Layer dependency matrix (ADR-002): a layer imports only the layers listed here.
// tests/<layer> follows the same row as src/<layer>.
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

const jsExtensionRestriction = {
  regex: `^(?:\\.\\.?|@(?:${layers.join('|')}))\\x2F.*\\.js$`,
  message:
    'Import a local module with its source extension (.ts), not with .js.',
};

// Every src and tests block goes through here, so the .js ban is never dropped
// when a later block overrides the restriction list.
function moduleRules(restrictions) {
  return restrictedImports([jsExtensionRestriction, ...restrictions]);
}

// One block per layer directory under root (src or tests).
function layerBlocks(root) {
  return boundaries.map(({ layer, allowThree, forbidden }) => ({
    files: [`${root}/${layer}/**/*.${SOURCE_EXTENSIONS}`],
    rules: moduleRules([
      ...(allowThree ? [] : [threeRestriction]),
      {
        regex: moduleRegex(forbidden),
        message: `${root}/${layer} does not import ${forbidden.join(', ')} (ADR-002 dependency matrix).`,
      },
    ]),
  }));
}

function zoneOf(file) {
  const relative = path.relative(SRC_DIR, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  const [first, ...rest] = relative.split(path.sep);
  return rest.length > 0 && layers.includes(first) ? first : '';
}

// The module path of a string literal or a template literal without ${…}.
function staticSpecifier(source) {
  if (source?.type === 'Literal' && typeof source.value === 'string') {
    return source.value;
  }
  if (source?.type === 'TemplateLiteral' && source.expressions.length === 0) {
    return source.quasis[0].value.cooked;
  }
  return null;
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
      const specifier = staticSpecifier(source);
      if (specifier === null || !specifier.startsWith('.')) {
        return;
      }

      const target = path.resolve(path.dirname(context.filename), specifier);
      if (zoneOf(target) !== zone) {
        context.report({
          node: source,
          messageId: 'outside',
          data: { source: specifier },
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

function propertyName(member) {
  if (!member.computed) {
    return member.property.name;
  }
  return member.property.type === 'Literal' ? member.property.value : null;
}

const noDynamicModulePath = {
  meta: {
    type: 'problem',
    messages: {
      dynamicImport:
        'import() needs a fixed string, so lint can check the layer boundary.',
      glob: 'import.meta.{{name}} loads modules lint cannot check. Import each module by name.',
    },
    schema: [],
  },
  create(context) {
    return {
      ImportExpression(node) {
        if (staticSpecifier(node.source) === null) {
          context.report({ node: node.source, messageId: 'dynamicImport' });
        }
      },
      MetaProperty(node) {
        const { parent } = node;
        if (
          node.meta.name !== 'import' ||
          parent.type !== 'MemberExpression' ||
          parent.object !== node
        ) {
          return;
        }

        const name = propertyName(parent);
        if (typeof name === 'string' && name.startsWith('glob')) {
          context.report({ node: parent, messageId: 'glob', data: { name } });
        }
      },
    };
  },
};

const indexReexportsOnly = {
  meta: {
    type: 'problem',
    messages: {
      logic:
        'An index file only re-exports (export … from). Move this code to its own module.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        for (const statement of program.body) {
          const reexport =
            statement.type === 'ExportAllDeclaration' ||
            (statement.type === 'ExportNamedDeclaration' &&
              statement.source !== null);
          if (!reexport) {
            context.report({ node: statement, messageId: 'logic' });
          }
        }
      },
    };
  },
};

const rafMessage =
  'The app has one loop, renderer.setAnimationLoop in src/main.ts (ADR-005). Do not call requestAnimationFrame.';

const allLayersRestriction = {
  regex: moduleRegex(layers.map((layer) => `@${layer}`)),
  message:
    'A test outside tests/<layer> does not import layer modules (ADR-002 dependency matrix).',
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  tseslint.configs.recommended,
  {
    plugins: {
      orbitka: {
        rules: {
          'no-relative-outside-layer': noRelativeOutsideLayer,
          'no-dynamic-module-path': noDynamicModulePath,
          'index-reexports-only': indexReexportsOnly,
        },
      },
    },
  },
  {
    files: [`src/**/*.${SOURCE_EXTENSIONS}`, `tests/**/*.${SOURCE_EXTENSIONS}`],
    rules: {
      'orbitka/no-relative-outside-layer': 'error',
      'orbitka/no-dynamic-module-path': 'error',
    },
  },
  {
    files: [`src/**/*.${SOURCE_EXTENSIONS}`],
    rules: moduleRules([threeRestriction]),
  },
  ...layerBlocks('src'),
  {
    files: [`src/**/*.${SOURCE_EXTENSIONS}`],
    ignores: ['src/main.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'requestAnimationFrame', message: rafMessage },
      ],
      'no-restricted-properties': [
        'error',
        { property: 'requestAnimationFrame', message: rafMessage },
      ],
    },
  },
  {
    files: [`src/**/index.${SOURCE_EXTENSIONS}`],
    rules: {
      'orbitka/index-reexports-only': 'error',
    },
  },
  {
    files: [`tests/**/*.${SOURCE_EXTENSIONS}`],
    rules: moduleRules([threeRestriction, allLayersRestriction]),
  },
  ...layerBlocks('tests'),
  eslintConfigPrettier,
);
