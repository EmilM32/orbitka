// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import { createI18n } from '@ui/i18n.ts';
import { createPageHeader } from '@ui/pageHeader.ts';

const i18n = createI18n(pl, 'pl-PL');
const CSS = readFileSync('src/ui/bodiesPanel.css', 'utf8');

test('visually hidden h1', () => {
  document.body.replaceChildren();
  const header = createPageHeader(document.body, i18n);
  const heading = header.querySelector('h1');
  expect(header.tagName).toBe('HEADER');
  expect(heading?.textContent).toBe('Orbitka: Układ Słoneczny');
  expect(heading?.className).toBe('visually-hidden');
  expect(heading?.style.display).not.toBe('none');
  expect(CSS).toMatch(
    /\.visually-hidden\s*\{[^}]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/u,
  );
  expect(CSS).not.toMatch(/\.visually-hidden\s*\{[^}]*display:\s*none/u);
});

test('brand is visible and aria-hidden', () => {
  document.body.replaceChildren();
  const header = createPageHeader(document.body, i18n);
  const brand = header.querySelector('.brand');
  expect(brand?.textContent).toBe('Orbitka');
  expect(brand?.getAttribute('aria-hidden')).toBe('true');
  expect(brand?.querySelector('svg.icon')).not.toBeNull();
  expect(brand?.closest('a')).toBeNull();
  expect(header.querySelector('h1.visually-hidden')?.textContent).toBe(
    'Orbitka: Układ Słoneczny',
  );
  expect(header.firstElementChild?.tagName).toBe('H1');
});
