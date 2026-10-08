import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

const WORKFLOW = readFileSync('.github/workflows/ci.yml', 'utf8');
const PACKAGE = JSON.parse(readFileSync('package.json', 'utf8')) as {
  devDependencies: Record<string, string>;
};

test('e2e image matches the pinned Playwright version', () => {
  const version = PACKAGE.devDependencies['@playwright/test'];
  expect(version).toMatch(/^\d+\.\d+\.\d+$/u);
  const image =
    /image:\s*mcr\.microsoft\.com\/playwright:v([\d.]+)-noble/u.exec(WORKFLOW);
  expect(image?.[1]).toBe(version);
});

test('no job installs browsers or system packages', () => {
  const commands = WORKFLOW.split('\n').filter((line) =>
    /^\s*-?\s*run:/u.test(line),
  );
  expect(commands.length).toBeGreaterThan(0);
  for (const command of commands) {
    expect(command).not.toMatch(/playwright install|apt-get/u);
  }
});

test('e2e job runs the visual snapshots and never updates them', () => {
  expect(WORKFLOW).toMatch(/ORBITKA_VISUAL:\s*'1'/u);
  const commands = WORKFLOW.split('\n').filter((line) =>
    /^\s*-?\s*run:/u.test(line),
  );
  for (const command of commands) {
    expect(command).not.toMatch(/--update-snapshots|\s-u(\s|$)/u);
  }
});
