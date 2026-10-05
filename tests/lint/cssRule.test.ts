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
