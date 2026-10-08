// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

import { VIEW_CONFIG } from '@core/viewConfig.ts';

// jsdom's import.meta.url is not a file: URL, so new URL(...) throws.
const CSS = readFileSync('src/ui/layout.css', 'utf8');

test('media queries match config', () => {
  expect(VIEW_CONFIG.tabletMaxWidthPx).toBe(1024);
  expect(VIEW_CONFIG.tabletMinWidthPx).toBe(768);
  expect(VIEW_CONFIG.drawerWidthPx).toBe(280);
  expect(CSS).toContain(
    `@media (max-width: ${VIEW_CONFIG.tabletMaxWidthPx}px)`,
  );
  expect(CSS).toContain(
    `@media (min-width: ${VIEW_CONFIG.tabletMaxWidthPx + 1}px)`,
  );
  expect(CSS).toContain(`${VIEW_CONFIG.drawerWidthPx}px`);
  expect(CSS).toContain('top: 112px');
});

test('tablet rules', () => {
  expect(CSS).toContain('left: 16px');
  expect(CSS).toContain('right: 16px');
  // The view group stays in the top bar, clear of the bottom sheet.
  expect(CSS).not.toContain('#view-controls');
  expect(CSS.includes('transition')).toBe(false);
});

test('debug overlay offset', () => {
  expect(CSS).toContain('left: 236px');
  expect(CSS).toContain('top: 112px');
});
