import { existsSync, readFileSync } from 'node:fs';

import { expect, test } from 'vitest';
import { build, type Rolldown } from 'vite';

// EMI-236. Title and description come from pl.json through the htmlCopy
// plugin (index.html stays free of Polish, ADR-008). Read as plain files: a
// repo test imports no layer module.
const PL = JSON.parse(
  readFileSync('src/content/locales/pl.json', 'utf8'),
) as Record<string, string>;

async function builtHtml(): Promise<string> {
  const result = await build({ logLevel: 'silent', build: { write: false } });
  const outputs = (
    Array.isArray(result) ? result : [result]
  ) as Rolldown.RolldownOutput[];
  const page = outputs
    .flatMap((item) => item.output)
    .find((item) => item.fileName === 'index.html');
  if (page?.type !== 'asset' || typeof page.source !== 'string') {
    throw new Error('no index.html in the build');
  }
  return page.source;
}

test('site head › built page has the title, description, color and icons', async () => {
  const html = await builtHtml();

  expect(/<title>([^<]*)<\/title>/u.exec(html)?.[1]).toBe(PL['app.title']);
  expect(/<meta name="description" content="([^"]*)"/u.exec(html)?.[1]).toBe(
    PL['app.description'],
  );
  expect(html).toContain('<meta name="theme-color" content="#05070d" />');
  expect(html).not.toContain('<!--app-description-->');
  expect(html).not.toContain('href="data:,"');

  const icons = [
    ...html.matchAll(/rel="(?:icon|apple-touch-icon)" href="\/([^"]+)"/gu),
  ].map((match) => match[1] ?? '');
  expect(icons).toEqual(['favicon.svg', 'apple-touch-icon.png']);
  for (const icon of icons) {
    expect(existsSync(`public/${icon}`), icon).toBe(true);
  }
  expect(readFileSync('ATTRIBUTION.md', 'utf8')).toContain(
    '`public/favicon.svg`',
  );
}, 60_000);
