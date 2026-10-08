import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { expect, test } from 'vitest';

const RULE_ID = 'orbitka/stylesheet-location';

const eslint = new ESLint({
  cwd: fileURLToPath(new URL('../..', import.meta.url)),
});

async function stylesheetErrors(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  if (!result) {
    throw new Error(`ESLint returned no result for ${filePath}`);
  }

  expect(result.messages.filter((message) => message.fatal)).toEqual([]);
  return result.messages.filter((message) => message.ruleId === RULE_ID);
}

test('eslintCssRule › rejects .css outside src/ui', async () => {
  for (const filePath of [
    'src/render/x.css',
    'src/sim/x.css',
    'src/core/x.css',
    'src/data/x.css',
    'src/content/x.css',
  ]) {
    expect(
      await stylesheetErrors(filePath, 'body { color: red; }\n'),
    ).toHaveLength(1);
  }

  expect(
    await stylesheetErrors('src/ui/x.css', 'body { color: red; }\n'),
  ).toEqual([]);
  expect(
    await stylesheetErrors('src/style.css', 'body { color: red; }\n'),
  ).toEqual([]);

  expect(
    await stylesheetErrors('src/ui/x.ts', `import '../style.css';\n`),
  ).toHaveLength(1);
  expect(
    await stylesheetErrors('src/render/x.ts', `import './x.css';\n`),
  ).toHaveLength(1);
  expect(
    await stylesheetErrors('src/main.ts', `import './style.css';\n`),
  ).toEqual([]);
  expect(
    await stylesheetErrors(
      'src/ui/debugOverlay.ts',
      `import './debugOverlay.css';\n`,
    ),
  ).toEqual([]);
});

test('eslintCssRule › a UI stylesheet is imported by its own module', async () => {
  const owner = await stylesheetErrors(
    'src/ui/scaleNotice.ts',
    `import './scaleNotice.css';\n`,
  );
  expect(owner).toEqual([]);

  for (const [filePath, code] of [
    ['src/main.ts', `import './ui/scaleNotice.css';\n`],
    ['src/ui/scaleNotice.ts', `import './timeControls.css';\n`],
    ['src/ui/panels/x.ts', `import '../x.css';\n`],
  ] as const) {
    const errors = await stylesheetErrors(filePath, code);
    expect(errors, `${filePath}: ${code}`).toHaveLength(1);
    expect(errors[0]?.message).toBe(
      'A UI stylesheet is imported only by the module of the same name: src/ui/x.ts imports ./x.css.',
    );
  }
});

test('css under docs/design/src is ignored, other docs css is rejected', async () => {
  const [mockup] = await eslint.lintText('body { color: red; }\n', {
    filePath: 'docs/design/src/x.css',
  });
  // ESLint has no config for the file, so it only warns that it skipped it.
  expect(mockup?.errorCount).toBe(0);
  expect(
    (mockup?.messages ?? []).filter((message) => message.ruleId === RULE_ID),
  ).toEqual([]);

  for (const filePath of ['docs/design/x.css', 'docs/x.css']) {
    const errors = await stylesheetErrors(filePath, 'body { color: red; }\n');
    expect(errors, filePath).toHaveLength(1);
    expect(errors[0]?.message).toBe(
      'Stylesheets are allowed only in src/ui/**/*.css and src/style.css.',
    );
  }
});
