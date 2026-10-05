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

// Vitest calls whose first argument is a module path that gets loaded or mocked.
const VI_OBJECTS = ['vi', 'vitest'];
const VI_MODULE_METHODS = ['mock', 'doMock', 'importActual', 'importMock'];
const viModuleCall = `CallExpression[callee.object.name=/^(?:${VI_OBJECTS.join('|')})$/][callee.property.name=/^(?:${VI_MODULE_METHODS.join('|')})$/]`;

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
        {
          selector: `TSImportType[argument.literal.value=/${regex}/]`,
          message,
        },
        {
          selector: `${viModuleCall}[arguments.0.value=/${regex}/]`,
          message,
        },
        {
          selector: `${viModuleCall}[arguments.0.quasis.0.value.cooked=/${regex}/]`,
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

// The module path argument of a call such as vi.importActual('three'), or null.
function viModuleSource(node) {
  const { callee } = node;
  if (
    callee.type !== 'MemberExpression' ||
    callee.object.type !== 'Identifier' ||
    !VI_OBJECTS.includes(callee.object.name) ||
    !VI_MODULE_METHODS.includes(callee.property.name)
  ) {
    return null;
  }
  return node.arguments[0] ?? null;
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
      const targetZone = zoneOf(target);
      if (targetZone === zone) {
        return;
      }

      context.report({
        node: source,
        messageId: 'outside',
        data: { source: specifier },
      });
    };

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
      TSImportType: (node) => check(node.argument.literal),
      CallExpression: (node) => check(viModuleSource(node)),
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
        'A module path in import() or vi.mock/importActual/importMock needs a fixed string, so lint can check the layer boundary.',
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
      CallExpression(node) {
        const source = viModuleSource(node);
        // vi.mock(import('…')) is checked through its ImportExpression.
        if (
          source !== null &&
          source.type !== 'ImportExpression' &&
          staticSpecifier(source) === null
        ) {
          context.report({ node: source, messageId: 'dynamicImport' });
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
  'The app has one loop: createLoop in src/core/loop.ts, driven by renderer.setAnimationLoop in src/render/createRenderer.ts (ADR-005). Do not call requestAnimationFrame.';

const REPO_ROOT = import.meta.dirname;

// CSS has no TypeScript parser. An empty program lets ESLint open .css files
// so stylesheet-location can reject stylesheets outside src/ui and src/style.css.
const cssTextParser = {
  meta: {
    name: 'orbitka-css-text',
    version: '1.0.0',
  },
  parse(text) {
    return {
      type: 'Program',
      body: [],
      sourceType: 'script',
      range: [0, text.length],
      loc: {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 0 },
      },
      tokens: [],
      comments: [],
    };
  },
};

function repoRelative(filename) {
  return path.relative(REPO_ROOT, filename).split(path.sep).join('/');
}

function isAllowedStylesheet(relativePath) {
  const normalized = path.posix.normalize(relativePath);
  if (normalized === 'src/style.css') {
    return true;
  }

  return (
    normalized.startsWith('src/ui/') &&
    normalized.endsWith('.css') &&
    !normalized.split('/').includes('..')
  );
}

function resolvedStylesheet(importer, specifier) {
  if (
    specifier === null ||
    !specifier.endsWith('.css') ||
    !specifier.startsWith('.')
  ) {
    return null;
  }

  return path.posix.normalize(
    path.posix.join(path.posix.dirname(importer), specifier),
  );
}

const stylesheetLocation = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      location:
        'Stylesheets are allowed only in src/ui/**/*.css and src/style.css.',
      entry: 'src/style.css may be imported only from src/main.ts.',
      owner:
        'A UI stylesheet is imported only by the module of the same name: src/ui/x.ts imports ./x.css.',
    },
  },
  create(context) {
    const importer = repoRelative(context.filename);

    function checkImport(node, source) {
      const resolved = resolvedStylesheet(importer, staticSpecifier(source));
      if (resolved === null) {
        return;
      }

      if (!isAllowedStylesheet(resolved)) {
        context.report({ node, messageId: 'location' });
        return;
      }

      if (resolved === 'src/style.css') {
        if (importer !== 'src/main.ts') {
          context.report({ node, messageId: 'entry' });
        }
        return;
      }

      if (resolved !== importer.replace(/\.[cm]?[jt]sx?$/, '.css')) {
        context.report({ node, messageId: 'owner' });
      }
    }

    return {
      Program(node) {
        if (importer.endsWith('.css') && !isAllowedStylesheet(importer)) {
          context.report({ node, messageId: 'location' });
        }
      },
      ImportDeclaration(node) {
        checkImport(node, node.source);
      },
      ImportExpression(node) {
        checkImport(node, node.source);
      },
    };
  },
};

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
          'stylesheet-location': stylesheetLocation,
        },
      },
    },
  },
  {
    files: [`src/**/*.${SOURCE_EXTENSIONS}`, `tests/**/*.${SOURCE_EXTENSIONS}`],
    rules: {
      'orbitka/no-relative-outside-layer': 'error',
      'orbitka/no-dynamic-module-path': 'error',
      'orbitka/stylesheet-location': 'error',
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
  // EMI-116 reads catalog axes and scene scale from one test outside tests/<layer>.
  {
    files: ['tests/integration/scaleNotice.test.ts'],
    rules: moduleRules([
      threeRestriction,
      {
        regex: moduleRegex(['@core', '@content', '@render', '@ui']),
        message:
          'tests/integration/scaleNotice.test.ts imports only @data and @sim (EMI-116).',
      },
    ]),
  },
  eslintConfigPrettier,
  {
    files: ['**/*.css'],
    languageOptions: {
      parser: cssTextParser,
    },
    rules: {
      'orbitka/stylesheet-location': 'error',
    },
  },
);
