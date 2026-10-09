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
import { type QualityLevel } from '@core/quality.ts';
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
    onQualityChange?: (level: QualityLevel | null) => void;
    qualityValue?: QualityLevel | null;
    qualityLocked?: boolean;
  } = {},
) {
  const selection = options.selection ?? createSelection(['mars', 'earth']);
  const onZoom = options.onZoom ?? vi.fn<(factor: number) => void>();
  const onOrbitsChange =
    options.onOrbitsChange ?? vi.fn<(visible: boolean) => void>();
  const onQualityChange =
    options.onQualityChange ?? vi.fn<(level: QualityLevel | null) => void>();
  const storage =
    options.storage === undefined ? memoryStorage() : options.storage;
  const controls = createViewControls(document.body, {
    i18n,
    selection,
    storage,
    onZoom,
    onOrbitsChange,
    onQualityChange,
    qualityValue: options.qualityValue ?? null,
    qualityLocked: options.qualityLocked ?? false,
  });
  return {
    controls,
    selection,
    onZoom,
    onOrbitsChange,
    onQualityChange,
    storage,
  };
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
    [
      'view-reset',
      'view-orbits',
      'view-zoom-out',
      'view-zoom-in',
      'view-settings',
    ],
  );
  expect(element.classList.contains('o-glass')).toBe(true);
  for (const control of buttons) {
    expect(control.getAttribute('type')).toBe('button');
    expect(control.disabled).toBe(false);
  }

  expect(button('view-reset').textContent).toBe('Cały układ');
  expect(button('view-reset').classList.contains('o-btn')).toBe(true);
  expect(button('view-orbits').textContent).toBe('Orbity');
  expect(button('view-zoom-in').textContent).toBe('');
  expect(button('view-zoom-in').getAttribute('aria-label')).toBe('Przybliż');
  expect(button('view-zoom-out').textContent).toBe('');
  expect(button('view-zoom-out').getAttribute('aria-label')).toBe('Oddal');
  for (const control of buttons) {
    expect(control.querySelector('svg.icon')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  }
});

test('orbits toggle has text and switch', () => {
  resetDocument();
  const storage = memoryStorage();
  mount({ storage });
  const orbits = button('view-orbits');
  const toggleSwitch = orbits.querySelector('span.o-toggle__switch');

  expect(orbits.classList.contains('o-toggle')).toBe(true);
  expect(orbits.textContent).toBe('Orbity');
  expect(toggleSwitch).not.toBeNull();
  expect(toggleSwitch?.getAttribute('aria-hidden')).toBe('true');
  expect(orbits.getAttribute('aria-pressed')).toBe('true');

  orbits.click();
  expect(orbits.getAttribute('aria-pressed')).toBe('false');
  expect(storage.getItem('orbitka.orbits')).toBe('false');
  orbits.click();
  expect(orbits.getAttribute('aria-pressed')).toBe('true');
  expect(storage.getItem('orbitka.orbits')).toBe('true');
});

test('zoom buttons reflect limits', () => {
  resetDocument();
  const onZoom = vi.fn<(factor: number) => void>();
  const { controls } = mount({ onZoom });
  const zoomIn = button('view-zoom-in');
  const zoomOut = button('view-zoom-out');

  controls.setZoomLimits(true, false);
  expect(zoomIn.getAttribute('aria-disabled')).toBe('true');
  expect(zoomOut.hasAttribute('aria-disabled')).toBe(false);
  // Still in the Tab order, but a click does nothing.
  expect(zoomIn.disabled).toBe(false);
  expect(zoomIn.tabIndex).toBe(0);
  zoomIn.click();
  expect(onZoom).not.toHaveBeenCalled();
  zoomOut.click();
  expect(onZoom).toHaveBeenCalledWith(CAMERA_CONFIG.zoomStepOut);

  controls.setZoomLimits(false, true);
  expect(zoomIn.hasAttribute('aria-disabled')).toBe(false);
  expect(zoomOut.getAttribute('aria-disabled')).toBe('true');
  zoomOut.click();
  expect(onZoom).toHaveBeenCalledTimes(1);

  controls.setZoomLimits(false, false);
  expect(zoomIn.hasAttribute('aria-disabled')).toBe(false);
  expect(zoomOut.hasAttribute('aria-disabled')).toBe(false);
  zoomIn.click();
  expect(onZoom).toHaveBeenLastCalledWith(CAMERA_CONFIG.zoomStepIn);
});

test('zoom limits touch the DOM only on change', () => {
  resetDocument();
  const { controls } = mount();
  const zoomIn = button('view-zoom-in');
  const setAttribute = vi.spyOn(zoomIn, 'setAttribute');
  const removeAttribute = vi.spyOn(zoomIn, 'removeAttribute');

  controls.setZoomLimits(false, false);
  controls.setZoomLimits(true, false);
  controls.setZoomLimits(true, false);
  controls.setZoomLimits(true, false);
  expect(setAttribute).toHaveBeenCalledTimes(1);
  expect(removeAttribute).not.toHaveBeenCalled();

  controls.dispose();
  expect(() => controls.setZoomLimits(false, false)).not.toThrow();
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

test('quality select', () => {
  resetDocument();
  const onQualityChange = vi.fn<(level: QualityLevel | null) => void>();
  mount({ onQualityChange, qualityValue: 'medium' });
  const toggle = button('view-settings');
  const panel = document.querySelector<HTMLElement>('#view-settings-panel');
  const select = document.querySelector<HTMLSelectElement>('#view-quality');
  if (panel === null || select === null) {
    throw new Error('missing settings panel');
  }

  expect(toggle.getAttribute('aria-label')).toBe('Ustawienia widoku');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(toggle.querySelector('svg.icon')).not.toBeNull();
  expect(panel.hidden).toBe(true);
  expect(document.querySelector('label[for="view-quality"]')?.textContent).toBe(
    'Jakość grafiki',
  );
  expect([...select.options].map((option) => option.textContent)).toEqual([
    'Automatyczna',
    'Wysoka',
    'Średnia',
    'Niska',
  ]);
  expect(select.value).toBe('medium');

  toggle.click();
  expect(panel.hidden).toBe(false);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');

  select.value = 'low';
  select.dispatchEvent(new Event('change'));
  expect(onQualityChange).toHaveBeenLastCalledWith('low');
  select.value = 'auto';
  select.dispatchEvent(new Event('change'));
  expect(onQualityChange).toHaveBeenLastCalledWith(null);
});

test('quality select is disabled when the address sets the level', () => {
  resetDocument();
  mount({ qualityValue: null, qualityLocked: true });
  const select = document.querySelector<HTMLSelectElement>('#view-quality');

  expect(select?.disabled).toBe(true);
  const hintId = select?.getAttribute('aria-describedby') ?? '';
  expect(document.getElementById(hintId)?.textContent).toBe(
    'Ustawione w adresie strony',
  );
});

test('quality panel closes on Esc and on a click outside', () => {
  resetDocument();
  mount();
  const toggle = button('view-settings');
  const panel = document.querySelector<HTMLElement>('#view-settings-panel');
  const select = document.querySelector<HTMLSelectElement>('#view-quality');
  const outside = document.createElement('div');
  document.body.append(outside);

  toggle.click();
  select?.focus();
  select?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  expect(panel?.hidden).toBe(true);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(toggle);

  toggle.click();
  expect(panel?.hidden).toBe(false);
  outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(panel?.hidden).toBe(true);

  toggle.click();
  panel?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(panel?.hidden).toBe(false);
});

test('dispose removes the outside click listener', () => {
  resetDocument();
  const { controls } = mount();
  button('view-settings').click();
  controls.dispose();

  expect(document.querySelector('#view-controls')).toBeNull();
  expect(() => {
    document.dispatchEvent(new Event('pointerdown'));
  }).not.toThrow();
});
