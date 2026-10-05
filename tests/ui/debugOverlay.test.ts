// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

import { createDebugOverlay } from '@ui/debugOverlay.ts';

function line(parent: ParentNode, name: string): HTMLElement {
  const element = parent.querySelector(`[data-debug-line="${name}"]`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`missing line ${name}`);
  }
  return element;
}

test('debugOverlay › lines', () => {
  const parent = document.createElement('div');
  document.body.append(parent);
  const overlay = createDebugOverlay(parent);

  overlay.update({ fps: 60, drawCalls: 12, triangles: 34_560 });

  const root = parent.querySelector('#debug-overlay');
  expect(root).not.toBeNull();
  expect(line(parent, 'fps').textContent).toBe('FPS: 60');
  expect(line(parent, 'calls').textContent).toBe('Draw calls: 12');
  expect(line(parent, 'triangles').textContent).toBe('Triangles: 34\u00A0560');
  expect(line(parent, 'triangles').textContent?.includes('\u00A0')).toBe(true);

  overlay.dispose();
  parent.remove();
});

test('debugOverlay › colors', () => {
  const parent = document.createElement('div');
  const overlay = createDebugOverlay(parent);
  const cases = [
    [55, 'debug-fps-good'],
    [54.9, 'debug-fps-mid'],
    [45, 'debug-fps-mid'],
    [44.9, 'debug-fps-low'],
  ] as const;

  for (const [fps, className] of cases) {
    overlay.update({ fps, drawCalls: 1, triangles: 1 });
    expect(line(parent, 'fps').className).toBe(className);
  }

  overlay.dispose();
});

test('debugOverlay › shown value matches color', () => {
  const parent = document.createElement('div');
  const overlay = createDebugOverlay(parent);
  const cases = [
    [59.99, 'FPS: 59', 'debug-fps-good'],
    [55.4, 'FPS: 55', 'debug-fps-good'],
    [54.6, 'FPS: 54', 'debug-fps-mid'],
    [45.9, 'FPS: 45', 'debug-fps-mid'],
    [44.6, 'FPS: 44', 'debug-fps-low'],
  ] as const;

  for (const [fps, text, className] of cases) {
    overlay.update({ fps, drawCalls: 1, triangles: 1 });
    expect(line(parent, 'fps').textContent).toBe(text);
    expect(line(parent, 'fps').className).toBe(className);
  }

  overlay.dispose();
});

test('debugOverlay › invalid values', () => {
  const parent = document.createElement('div');
  const overlay = createDebugOverlay(parent);

  for (const fps of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    expect(() =>
      overlay.update({ fps, drawCalls: 1, triangles: 1 }),
    ).not.toThrow();
    expect(line(parent, 'fps').textContent).toBe('FPS: —');
    expect(line(parent, 'fps').className).toBe('');
  }

  overlay.update({ fps: 60, drawCalls: Number.NaN, triangles: -5 });
  expect(line(parent, 'calls').textContent).toBe('Draw calls: —');
  expect(line(parent, 'triangles').textContent).toBe('Triangles: —');
  expect(line(parent, 'fps').className).toBe('debug-fps-good');

  overlay.dispose();
});

test('debugOverlay › css', () => {
  const css = readFileSync('src/ui/debugOverlay.css', 'utf8');

  expect(css).toContain('--debug-top: calc(8px + 44px + 8px)');
  expect(css).toMatch(/\.debug-fps-good\s*\{[^}]*color:\s*#3dd68c/);
  expect(css).toMatch(/\.debug-fps-mid\s*\{[^}]*color:\s*#e6c200/);
  expect(css).toMatch(/\.debug-fps-low\s*\{[^}]*color:\s*#e5484d/);
});

test('debugOverlay › dispose', () => {
  const parent = document.createElement('div');
  document.body.append(parent);
  const overlay = createDebugOverlay(parent);

  overlay.dispose();
  expect(document.querySelector('#debug-overlay')).toBeNull();
  expect(() => overlay.dispose()).not.toThrow();
  expect(() =>
    overlay.update({ fps: 10, drawCalls: 1, triangles: 1 }),
  ).not.toThrow();
  expect(document.querySelector('#debug-overlay')).toBeNull();
  parent.remove();
});
