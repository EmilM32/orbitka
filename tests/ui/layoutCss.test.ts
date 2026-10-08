// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

import { VIEW_CONFIG } from '@core/viewConfig.ts';

// jsdom's import.meta.url is not a file: URL, so new URL(...) throws.
const CSS = readFileSync('src/ui/layout.css', 'utf8');
const TOKENS = readFileSync('src/ui/tokens.css', 'utf8');

function rule(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return CSS.slice(start, CSS.indexOf('}', start));
}

test('media queries match config', () => {
  expect(VIEW_CONFIG.tabletMaxWidthPx).toBe(1024);
  expect(VIEW_CONFIG.tabletMinWidthPx).toBe(768);
  expect(CSS).toContain(
    `@media (max-width: ${VIEW_CONFIG.tabletMaxWidthPx}px)`,
  );
  expect(CSS).toContain(
    `@media (min-width: ${VIEW_CONFIG.tabletMaxWidthPx + 1}px)`,
  );
});

test('drawer uses --drawer-w', () => {
  expect(VIEW_CONFIG.drawerWidthPx).toBe(300);
  // 18.75rem at 16 px per rem.
  expect(TOKENS).toContain('--drawer-w: 18.75rem;');
  expect(18.75 * 16).toBe(VIEW_CONFIG.drawerWidthPx);
  const drawer = rule('#bodies-drawer:not([hidden])');
  expect(drawer).toContain('width: var(--drawer-w)');
  expect(drawer).toContain('z-index: var(--z-drawer)');
  expect(drawer).toContain('animation: drawer-in var(--dur) var(--ease-out)');
  expect(CSS).toMatch(
    /@keyframes drawer-in\s*\{\s*from\s*\{\s*opacity: 0;\s*transform: translateX\(-1rem\);/u,
  );
});

test('open button looks pressed while the drawer is open', () => {
  const pressed = rule("#bodies-drawer-open[aria-expanded='true']");
  expect(pressed).toContain('background: var(--c-surface-active)');
  expect(pressed).toContain('border-color: var(--c-active-border)');
  expect(rule('#bodies-drawer-open')).toContain(
    'top: calc(var(--topbar-h) + var(--s-2))',
  );
});

test('tablet rules', () => {
  expect(CSS).toContain('left: 16px');
  expect(CSS).toContain('right: 16px');
  // The view group stays in the top bar, clear of the bottom sheet.
  expect(CSS).not.toContain('#view-controls');
  expect(CSS.includes('transition')).toBe(false);
  // The drawer has no fold button at all (collapsible: false), not a hidden one.
  expect(CSS).not.toContain('#bodies-collapse');
});

test('debug overlay offset', () => {
  expect(CSS).toContain('left: calc(var(--edge) + var(--list-w) + var(--s-2))');
  expect(CSS).toContain('top: var(--drawer-top)');
});
