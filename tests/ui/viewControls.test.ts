// @vitest-environment jsdom

import { expect, test, vi } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import {
  createSelection,
  type Selection,
  type SelectionEvent,
} from '@core/selection.ts';
import { createI18n } from '@ui/i18n.ts';
import { type OrbitsStorage } from '@ui/orbitsPreference.ts';
import { createViewControls } from '@ui/viewControls.ts';

const i18n = createI18n(pl, 'pl-PL');

function resetDocument(): void {
  document.body.replaceChildren();
}

function memoryStorage(value: string | null = null): OrbitsStorage {
  const data = new Map<string, string>();
  if (value !== null) {
    data.set('orbitka.orbits', value);
  }
  return {
    getItem(key: string): string | null {
      return data.get(key) ?? null;
    },
    setItem(key: string, stored: string): void {
      data.set(key, stored);
    },
  };
}

function mount(
  options: {
    selection?: Selection;
    storage?: OrbitsStorage | null;
    onZoom?: (factor: number) => void;
    onOrbitsChange?: (visible: boolean) => void;
  } = {},
) {
  const selection = options.selection ?? createSelection(['mars', 'earth']);
  const onZoom = options.onZoom ?? vi.fn<(factor: number) => void>();
  const onOrbitsChange =
    options.onOrbitsChange ?? vi.fn<(visible: boolean) => void>();
  const storage =
    options.storage === undefined ? memoryStorage() : options.storage;
  const controls = createViewControls(document.body, {
    i18n,
    selection,
    storage,
    onZoom,
    onOrbitsChange,
  });
  return { controls, selection, onZoom, onOrbitsChange, storage };
}

function button(testId: string): HTMLButtonElement {
  const found = document.querySelector(`[data-testid="${testId}"]`);
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`missing button ${testId}`);
  }
  return found;
}

test('group structure', () => {
  resetDocument();
  const { controls } = mount();
  const { element } = controls;

  expect(element.tagName).toBe('DIV');
  expect(element.id).toBe('view-controls');
  expect(element.getAttribute('role')).toBe('group');
  expect(element.getAttribute('aria-label')).toBe('Widok');
  expect(element.getAttribute('data-testid')).toBe('view-controls');

  const buttons = [...element.querySelectorAll('button')];
  expect(buttons.map((control) => control.getAttribute('data-testid'))).toEqual(
    ['view-reset', 'view-orbits', 'view-zoom-in', 'view-zoom-out'],
  );
  for (const control of buttons) {
    expect(control.getAttribute('type')).toBe('button');
    expect(control.disabled).toBe(false);
  }

  expect(button('view-reset').textContent).toBe('Cały układ');
  expect(button('view-orbits').textContent).toBe('Orbity');
  expect(button('view-zoom-in').textContent).toBe('+');
  expect(button('view-zoom-in').getAttribute('aria-label')).toBe('Przybliż');
  expect(button('view-zoom-out').textContent).toBe('\u2212');
  expect(button('view-zoom-out').getAttribute('aria-label')).toBe('Oddal');
});

test('reset calls showSystem', () => {
  resetDocument();
  const selection = createSelection(['mars', 'earth']);
  const events: SelectionEvent[] = [];
  selection.subscribe((event) => {
    events.push(event);
  });
  mount({ selection });
  const reset = button('view-reset');

  reset.click();
  reset.click();
  expect(events).toEqual([
    { kind: 'system', previousId: null },
    { kind: 'system', previousId: null },
  ]);

  selection.select('mars');
  reset.click();
  expect(events.at(-1)).toEqual({ kind: 'system', previousId: 'mars' });
  expect(events.filter((event) => event.kind === 'system')).toHaveLength(3);
});

test('zoom buttons call onZoom with steps', () => {
  resetDocument();
  const onZoom = vi.fn<(factor: number) => void>();
  const selection = createSelection(['mars', 'earth']);
  const events: SelectionEvent[] = [];
  selection.subscribe((event) => {
    events.push(event);
  });
  mount({ selection, onZoom });

  button('view-zoom-in').click();
  button('view-zoom-out').click();

  expect(onZoom).toHaveBeenNthCalledWith(1, 0.9);
  expect(onZoom).toHaveBeenNthCalledWith(2, 1.1);
  expect(onZoom.mock.calls[0]?.[0]).toBe(CAMERA_CONFIG.zoomStepIn);
  expect(onZoom.mock.calls[1]?.[0]).toBe(CAMERA_CONFIG.zoomStepOut);
  expect(button('view-zoom-in').disabled).toBe(false);
  expect(button('view-zoom-out').disabled).toBe(false);
  expect(events).toEqual([]);
});

test('orbits default on', () => {
  resetDocument();
  const onOrbitsChange = vi.fn<(visible: boolean) => void>();
  const setItem = vi.fn<(key: string, value: string) => void>();
  mount({
    storage: {
      getItem: () => null,
      setItem,
    },
    onOrbitsChange,
  });
  const orbits = button('view-orbits');

  expect(orbits.getAttribute('aria-pressed')).toBe('true');
  expect(orbits.getAttribute('title')).toBe('Pokaż lub ukryj linie orbit');
  expect(onOrbitsChange).toHaveBeenCalledTimes(1);
  expect(onOrbitsChange).toHaveBeenCalledWith(true);
  expect(setItem).not.toHaveBeenCalled();
});

test('orbits toggle persists', () => {
  resetDocument();
  const onOrbitsChange = vi.fn<(visible: boolean) => void>();
  const setItem = vi.fn<(key: string, value: string) => void>();
  const selection = createSelection(['mars', 'earth']);
  const events: SelectionEvent[] = [];
  selection.subscribe((event) => {
    events.push(event);
  });
  mount({
    selection,
    storage: {
      getItem: () => null,
      setItem,
    },
    onOrbitsChange,
  });

  button('view-orbits').click();

  expect(button('view-orbits').getAttribute('aria-pressed')).toBe('false');
  expect(onOrbitsChange).toHaveBeenLastCalledWith(false);
  expect(setItem).toHaveBeenCalledWith('orbitka.orbits', 'false');
  expect(selection.getSelectedId()).toBeNull();
  expect(events).toEqual([]);
});

test('orbits restored from storage', () => {
  resetDocument();
  const onOrbitsChange = vi.fn<(visible: boolean) => void>();
  mount({
    storage: memoryStorage('false'),
    onOrbitsChange,
  });

  expect(button('view-orbits').getAttribute('aria-pressed')).toBe('false');
  expect(onOrbitsChange).toHaveBeenCalledTimes(1);
  expect(onOrbitsChange).toHaveBeenCalledWith(false);
});
