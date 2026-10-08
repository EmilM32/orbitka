// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { expect, test, vi } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import { createSelection } from '@core/selection.ts';
import { VIEW_CONFIG } from '@core/viewConfig.ts';
import { createI18n } from '@ui/i18n.ts';
import {
  loadOrbitsVisible,
  saveOrbitsVisible,
  type OrbitsStorage,
} from '@ui/orbitsPreference.ts';
import { createViewControls } from '@ui/viewControls.ts';

const i18n = createI18n(pl, 'pl-PL');

// jsdom's import.meta.url is not a file: URL, so readFileSync(new URL(...)) throws.
const CSS = readFileSync('src/ui/viewControls.css', 'utf8');
const PREFERENCE_SOURCE = readFileSync('src/ui/orbitsPreference.ts', 'utf8');
const CONTROLS_SOURCE = readFileSync('src/ui/viewControls.ts', 'utf8');

function resetDocument(): void {
  document.body.replaceChildren();
}

function button(testId: string): HTMLButtonElement {
  const found = document.querySelector(`[data-testid="${testId}"]`);
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`missing button ${testId}`);
  }
  return found;
}

function mount(storage: OrbitsStorage | null = null) {
  const onOrbitsChange = vi.fn<(visible: boolean) => void>();
  const controls = createViewControls(document.body, {
    i18n,
    selection: createSelection(['mars']),
    storage,
    onZoom: vi.fn<(factor: number) => void>(),
    onOrbitsChange,
  });
  return { controls, onOrbitsChange };
}

test('invalid values fall back to true', () => {
  for (const value of ['1', '0', '', 'TRUE', 'null', null]) {
    const storage: OrbitsStorage = {
      getItem: () => value,
      setItem: () => undefined,
    };
    expect(loadOrbitsVisible(storage)).toBe(true);
  }
  expect(loadOrbitsVisible(null)).toBe(true);
  expect(() => saveOrbitsVisible(null, false)).not.toThrow();
});

test('storage errors are swallowed', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const storage: OrbitsStorage = {
    getItem(): string | null {
      throw new Error('getItem blocked');
    },
    setItem(): void {
      throw new Error('setItem blocked');
    },
  };

  expect(loadOrbitsVisible(storage)).toBe(true);
  expect(() => saveOrbitsVisible(storage, false)).not.toThrow();

  resetDocument();
  const { controls } = mount(storage);
  const orbits = button('view-orbits');
  expect(orbits.getAttribute('aria-pressed')).toBe('true');
  expect(() => orbits.click()).not.toThrow();
  expect(controls.isOrbitsVisible()).toBe(false);
  expect(orbits.getAttribute('aria-pressed')).toBe('false');
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
  controls.dispose();
});

test('storage key literal', () => {
  expect(VIEW_CONFIG.orbitsStorageKey).toBe('orbitka.orbits');
  expect(VIEW_CONFIG.orbitsStorageKey.startsWith('orbitka.')).toBe(true);

  const keys: string[] = [];
  const storage: OrbitsStorage = {
    getItem(key: string): string | null {
      keys.push(key);
      return null;
    },
    setItem(key: string): void {
      keys.push(key);
    },
  };
  const cookie = vi.spyOn(Document.prototype, 'cookie', 'get');

  expect(loadOrbitsVisible(storage)).toBe(true);
  saveOrbitsVisible(storage, false);

  expect(keys).toEqual(['orbitka.orbits', 'orbitka.orbits']);
  expect(cookie).not.toHaveBeenCalled();
  cookie.mockRestore();

  expect(PREFERENCE_SOURCE).toContain('VIEW_CONFIG.orbitsStorageKey');
  expect(PREFERENCE_SOURCE).not.toContain('document.cookie');
  expect(CONTROLS_SOURCE).not.toContain('document.cookie');
  expect(PREFERENCE_SOURCE).not.toMatch(/['"]orbitka\.orbits['"]/u);
  expect(`${PREFERENCE_SOURCE}\n${CONTROLS_SOURCE}`).not.toMatch(
    /addEventListener\(\s*['"]storage['"]/u,
  );
});

test('double toggle', () => {
  resetDocument();
  const data = new Map<string, string>();
  const storage: OrbitsStorage = {
    getItem(key: string): string | null {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      data.set(key, value);
    },
  };
  const { controls } = mount(storage);
  const orbits = button('view-orbits');

  orbits.click();
  orbits.click();

  expect(controls.isOrbitsVisible()).toBe(true);
  expect(orbits.getAttribute('aria-pressed')).toBe('true');
  expect(data.get(VIEW_CONFIG.orbitsStorageKey)).toBe('true');
  controls.dispose();
});

test('icon is decorative and shows off state', () => {
  resetDocument();
  const { controls } = mount();
  const orbits = button('view-orbits');
  const svg = orbits.querySelector('svg');
  const slash = orbits.querySelector('.view-orbits-off');

  expect(svg?.getAttribute('aria-hidden')).toBe('true');
  expect(slash?.tagName.toLowerCase()).toBe('line');
  expect(CSS).toMatch(/\.view-orbits-off\s*\{[^}]*display:\s*none/u);
  expect(CSS).toMatch(
    /\.view-orbits\[aria-pressed='false'\]\s+\.view-orbits-off\s*\{[^}]*display:\s*block/u,
  );

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  expect(getComputedStyle(slash as Element).display).toBe('none');
  orbits.click();
  expect(orbits.getAttribute('aria-pressed')).toBe('false');
  expect(getComputedStyle(slash as Element).display).toBe('block');
  style.remove();
  controls.dispose();
});

test('css contract', () => {
  expect(CSS).toContain('position: fixed');
  expect(CSS).toContain('top: 8px');
  expect(CSS).toContain('right: 8px');
  expect(CSS).toContain('z-index: var(--z-panels)');
  expect(CSS).toContain('flex-direction: column');
  expect(CSS).toContain('gap: 8px');
  expect(CSS).toMatch(/min-width:\s*44px/u);
  expect(CSS).toMatch(/min-height:\s*44px/u);
  // Focus is the global ring from controls.css (EMI-217), never yellow.
  expect(CSS).not.toContain('focus-visible');
  expect(CSS).toContain('border: 1px solid #8a93ad');
  expect(CSS).toContain('border-radius: 6px');
  expect(CSS).toContain('background: var(--c-surface-active)');
  expect(CSS).not.toMatch(/transition/iu);
  expect(CSS).not.toMatch(/animation/iu);
});

test('text contrast at least 4.5', () => {
  const background = CSS.match(
    /background:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/u,
  );
  // color: var(--c-text) is #f2f4fa in tokens.css.
  const foreground = CSS.includes('color: var(--c-text)')
    ? ['', 'f2f4fa']
    : null;
  expect(background).not.toBeNull();
  expect(foreground).not.toBeNull();
  if (background === null || foreground === null) {
    return;
  }

  const panel: [number, number, number] = [
    Number(background[1]),
    Number(background[2]),
    Number(background[3]),
  ];
  const alpha = Number(background[4]);
  const hex = foreground[1] ?? '000000';
  const text: [number, number, number] = [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
  const onWhite = composite(panel, alpha, [255, 255, 255]);
  const onSun = composite(panel, alpha, [253, 184, 19]);

  expect(contrast(text, onWhite)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(text, onSun)).toBeGreaterThanOrEqual(4.5);
});

test('pl.json keys', () => {
  expect(pl['view.group.label']).toBe('Widok');
  expect(pl['view.reset.text']).toBe('Cały układ');
  expect(pl['view.orbits.text']).toBe('Orbity');
  expect(pl['view.orbits.title']).toBe('Pokaż lub ukryj linie orbit');
  expect(pl['view.zoomIn.text']).toBe('+');
  expect(pl['view.zoomIn.ariaLabel']).toBe('Przybliż');
  expect(pl['view.zoomOut.text']).toBe('\u2212');
  expect(pl['view.zoomOut.text'].codePointAt(0)).toBe(0x2212);
  expect(pl['view.zoomOut.ariaLabel']).toBe('Oddal');
});

test('tab order inside group', () => {
  resetDocument();
  const { controls } = mount();
  const ids = [...controls.element.querySelectorAll('button')].map((control) =>
    control.getAttribute('data-testid'),
  );
  expect(ids).toEqual([
    'view-reset',
    'view-orbits',
    'view-zoom-in',
    'view-zoom-out',
  ]);
  controls.dispose();
});

test('dispose cleans up', () => {
  resetDocument();
  const onOrbitsChange = vi.fn<(visible: boolean) => void>();
  const onZoom = vi.fn<(factor: number) => void>();
  const controls = createViewControls(document.body, {
    i18n,
    selection: createSelection(['mars']),
    storage: null,
    onZoom,
    onOrbitsChange,
  });
  const orbits = button('view-orbits');
  const zoomIn = button('view-zoom-in');

  controls.dispose();

  expect(controls.element.isConnected).toBe(false);
  expect(document.querySelector('#view-controls')).toBeNull();
  orbits.click();
  zoomIn.click();
  expect(onOrbitsChange).toHaveBeenCalledTimes(1);
  expect(onZoom).not.toHaveBeenCalled();
  expect(() => controls.dispose()).not.toThrow();
});

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: readonly [number, number, number]): number {
  return (
    0.2126 * channel(rgb[0]) +
    0.7152 * channel(rgb[1]) +
    0.0722 * channel(rgb[2])
  );
}

function contrast(
  foreground: readonly [number, number, number],
  background: readonly [number, number, number],
): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function composite(
  color: readonly [number, number, number],
  alpha: number,
  background: readonly [number, number, number],
): [number, number, number] {
  return [
    color[0] * alpha + background[0] * (1 - alpha),
    color[1] * alpha + background[1] * (1 - alpha),
    color[2] * alpha + background[2] * (1 - alpha),
  ];
}
