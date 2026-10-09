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
const CONTROLS_CSS = readFileSync('src/ui/controls.css', 'utf8');

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
    onQualityChange: vi.fn(),
    qualityValue: null,
    qualityLocked: false,
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

test('icon is decorative and the switch shows the state', () => {
  resetDocument();
  const { controls } = mount();
  const orbits = button('view-orbits');
  const svg = orbits.querySelector('svg');

  expect(svg?.getAttribute('aria-hidden')).toBe('true');
  expect(orbits.querySelector('.o-toggle__switch')).not.toBeNull();
  // The icon comes from icons.ts; the old local icon with a slash is gone.
  expect(orbits.querySelector('.view-orbits-off')).toBeNull();
  expect(CONTROLS_SOURCE).not.toContain('orbitIcon');
  expect(CONTROLS_SOURCE).toContain("createIcon('orbits')");
  controls.dispose();
});

test('css contract', () => {
  expect(CSS).toContain('position: fixed');
  expect(CSS).toContain('right: var(--edge)');
  expect(CSS).toContain('z-index: var(--z-panels)');
  expect(CSS).toContain('flex-direction: row');
  // Focus is the global ring from controls.css (EMI-217), never yellow.
  expect(CSS).not.toContain('focus-visible');
  // No yellow in the group: the switch is mint (controls.css).
  expect(CSS).not.toContain('--c-accent');
  expect(CONTROLS_CSS).toMatch(
    /\.o-toggle\[aria-pressed='true'\] \.o-toggle__switch\s*\{[^}]*background:\s*var\(--c-on\)/u,
  );
  expect(CONTROLS_CSS).toMatch(
    /\.o-toggle__switch\s*\{[^}]*border:\s*1\.5px solid var\(--c-control-border\)/u,
  );
  // Text is never hidden on a breakpoint.
  expect(CSS).not.toMatch(/display:\s*none/u);
  expect(CSS).not.toMatch(/@media/u);
});

test('pl.json keys', () => {
  expect(pl['view.group.label']).toBe('Widok');
  expect(pl['view.reset.text']).toBe('Cały układ');
  expect(pl['view.orbits.text']).toBe('Orbity');
  expect(pl['view.orbits.title']).toBe('Pokaż lub ukryj linie orbit');
  expect(pl['view.zoomIn.ariaLabel']).toBe('Przybliż');
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
    'view-zoom-out',
    'view-zoom-in',
    'view-settings',
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
    onQualityChange: vi.fn(),
    qualityValue: null,
    qualityLocked: false,
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
