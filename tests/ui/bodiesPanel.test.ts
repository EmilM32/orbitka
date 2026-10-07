// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import { getSelectableBodies } from '@core/selectableBodies.ts';
import { type SelectableBody } from '@core/selectableBodies.ts';
import { createSelection, type Selection } from '@core/selection.ts';
import { bodies as catalog } from '@data/bodies.ts';
import { createBodiesPanel, type BodiesPanel } from '@ui/bodiesPanel.ts';
import { createI18n, type I18n, type Dictionary } from '@ui/i18n.ts';
import { createPageHeader } from '@ui/pageHeader.ts';

const i18n = createI18n(pl, 'pl-PL');
const messages: Record<string, unknown> = pl;

const CSS = readFileSync('src/ui/bodiesPanel.css', 'utf8');
const SOURCE = readFileSync('src/ui/bodiesPanel.ts', 'utf8');

const ORDER = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
];

function reset(): void {
  document.body.replaceChildren();
}

function mount(
  bodies: readonly SelectableBody[],
  selection = createSelection(bodies.map((body) => body.id)),
  options: { getFocusFallback?: () => HTMLElement | null } = {},
): { panel: BodiesPanel; selection: Selection } {
  const panel = createBodiesPanel(document.body, {
    bodies,
    selection,
    i18n,
    getFocusFallback: options.getFocusFallback,
  });
  return { panel, selection };
}

function item(id: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    `[data-testid="body-item-${id}"]`,
  );
  if (button === null) {
    throw new Error(`missing item ${id}`);
  }
  return button;
}

function pressedIds(): string[] {
  return [...document.querySelectorAll<HTMLButtonElement>('.bodies-item')]
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map((button) => button.getAttribute('data-body-id') ?? '');
}

test('renders one button per body', () => {
  reset();
  const selectable = getSelectableBodies(catalog);
  mount(selectable);
  const buttons = [
    ...document.querySelectorAll<HTMLButtonElement>('.bodies-item'),
  ];
  expect(buttons.map((button) => button.getAttribute('data-body-id'))).toEqual(
    ORDER,
  );
  expect(buttons).toHaveLength(9);

  reset();
  const three: SelectableBody[] = [
    { id: 'sun', type: 'star', radiusKm: 1 },
    { id: 'earth', type: 'planet', radiusKm: 1 },
    { id: 'mars', type: 'planet', radiusKm: 1 },
  ];
  mount(three);
  expect(
    [...document.querySelectorAll('.bodies-item')].map((button) =>
      button.getAttribute('data-body-id'),
    ),
  ).toEqual(['sun', 'earth', 'mars']);
});

test('labels and kinds', () => {
  reset();
  mount(getSelectableBodies(catalog));
  const earth = item('earth');
  expect(earth.textContent).toContain('Ziemia');
  expect(earth.textContent).toContain('planeta skalista');
  expect(item('mars').getAttribute('aria-label')).toBe(
    'Wybierz: Mars, planeta skalista',
  );
  expect(item('jupiter').getAttribute('aria-label')).toBe(
    'Wybierz: Jowisz, gazowy olbrzym',
  );
  expect(item('sun').getAttribute('aria-label')).toBe(
    'Wybierz: Słońce, gwiazda',
  );
  expect(document.querySelector('#bodies-panel-title')?.textContent).toBe(
    'Ciała niebieskie',
  );
});

test('items are native buttons', () => {
  reset();
  mount(getSelectableBodies(catalog));
  for (const button of document.querySelectorAll('.bodies-item')) {
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
  }
  expect(SOURCE).not.toMatch(/keydown/u);
});

test('click selects', () => {
  reset();
  const { selection } = mount(getSelectableBodies(catalog));
  item('mars').click();
  expect(selection.getSelectedId()).toBe('mars');
});

test('aria-pressed follows selection', () => {
  reset();
  const selectable = getSelectableBodies(catalog);
  const selection = createSelection([
    ...selectable.map((body) => body.id),
    'pluto',
  ]);
  mount(selectable, selection);
  item('earth').click();
  expect(pressedIds()).toEqual(['earth']);
  item('mars').click();
  expect(pressedIds()).toEqual(['mars']);
  selection.select('pluto');
  expect(pressedIds()).toEqual(['mars']);
});

test('selected name is bold', () => {
  reset();
  mount(getSelectableBodies(catalog));
  item('earth').click();
  expect(item('earth').classList.contains('is-selected')).toBe(true);
  expect(item('mars').classList.contains('is-selected')).toBe(false);
  expect(CSS).toMatch(
    /\.bodies-item\.is-selected \.bodies-item-name\s*\{[^}]*font-weight:\s*700/u,
  );
});

test('focus stays on button after select', () => {
  reset();
  mount(getSelectableBodies(catalog));
  const earth = item('earth');
  earth.focus();
  earth.click();
  expect(document.activeElement).toBe(earth);
  expect(earth.isConnected).toBe(true);
});

test('focus returns to previous item on system', () => {
  reset();
  const fallback = document.createElement('button');
  const outside = document.createElement('button');
  document.body.append(fallback, outside);
  const selectable = getSelectableBodies(catalog);
  const selection = createSelection(selectable.map((body) => body.id));
  const { panel } = mount(selectable, selection, {
    getFocusFallback: () => fallback,
  });
  const earth = item('earth');
  earth.click();
  outside.focus();
  selection.showSystem();
  expect(document.activeElement).toBe(earth);

  item('mars').click();
  panel.setCollapsed(true);
  outside.focus();
  selection.showSystem();
  expect(document.activeElement).toBe(
    document.querySelector('#bodies-collapse'),
  );

  panel.setCollapsed(false);
  item('earth').click();
  panel.element.hidden = true;
  outside.focus();
  selection.showSystem();
  expect(document.activeElement).toBe(fallback);

  reset();
  const idleOutside = document.createElement('button');
  document.body.append(idleOutside);
  const idleSelection = createSelection(selectable.map((body) => body.id));
  mount(selectable, idleSelection, { getFocusFallback: () => fallback });
  idleOutside.focus();
  idleSelection.showSystem();
  expect(document.activeElement).toBe(idleOutside);
});

test('collapse toggles list', () => {
  reset();
  const { selection } = mount(getSelectableBodies(catalog));
  const toggle = document.querySelector<HTMLButtonElement>('#bodies-collapse');
  const list = document.querySelector<HTMLElement>('#bodies-list');
  if (toggle === null || list === null) {
    throw new Error('missing collapse controls');
  }
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(toggle.getAttribute('aria-controls')).toBe('bodies-list');
  expect(toggle.getAttribute('aria-label')).toBe('Zwiń listę ciał');
  expect(list.hidden).toBe(false);

  item('earth').click();
  expect(item('earth').getAttribute('aria-pressed')).toBe('true');
  toggle.click();
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(toggle.getAttribute('aria-label')).toBe('Rozwiń listę ciał');
  expect(list.hidden).toBe(true);
  expect(item('earth').getAttribute('aria-pressed')).toBe('true');
  expect(selection.getSelectedId()).toBe('earth');

  toggle.click();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(list.hidden).toBe(false);
  expect(item('earth').getAttribute('aria-pressed')).toBe('true');
});

test('hover class from selection', () => {
  reset();
  const { selection } = mount(getSelectableBodies(catalog));
  selection.setHovered('earth');
  expect(item('earth').classList.contains('is-hovered')).toBe(true);
  selection.setHovered('mars');
  expect(item('earth').classList.contains('is-hovered')).toBe(false);
  expect(item('mars').classList.contains('is-hovered')).toBe(true);
  selection.setHovered(null);
  expect(item('mars').classList.contains('is-hovered')).toBe(false);
});

test('empty list throws', () => {
  reset();
  const selection = createSelection(['sun']);
  expect(() =>
    createBodiesPanel(document.body, { bodies: [], selection, i18n }),
  ).toThrow(
    new RangeError(
      'createBodiesPanel: parameter "bodies" must contain at least one body, got 0',
    ),
  );
});

test('header panel canvas order', () => {
  reset();
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const header = createPageHeader(document.body, i18n, canvas);
  const selectable = getSelectableBodies(catalog);
  createBodiesPanel(document.body, {
    bodies: selectable,
    selection: createSelection(selectable.map((body) => body.id)),
    i18n,
    before: canvas,
  });
  const heading = header.querySelector('h1');
  const panel = document.querySelector('#bodies-panel');
  if (heading === null || panel === null) {
    throw new Error('missing header or panel');
  }
  const order = [
    ...document.body.querySelectorAll('h1, #bodies-panel, canvas'),
  ];
  expect(order).toEqual([heading, panel, canvas]);
});

test('css contract', () => {
  expect(CSS).toContain('width: 220px');
  expect(CSS).toContain('left: 8px');
  expect(CSS).toContain('top: 60px');
  expect(CSS).toContain('outline: 2px solid #ffd54a');
  expect(CSS).toContain('outline-offset: 2px');
  expect(CSS).toContain('min-height: 32px');
  expect(CSS).toMatch(
    /@media \(pointer: coarse\)\s*\{[^}]*min-height:\s*44px/u,
  );
  expect(CSS).toContain('font-weight: 700');
  expect(CSS).not.toMatch(/transition/iu);
  expect(CSS).not.toMatch(/animation/iu);
  expect(CSS).toContain('overflow-wrap: anywhere');
  expect(CSS).toContain(
    'max-height: calc(100vh - 76px - var(--time-panel-height, 0px) - 24px)',
  );
});

test('text contrast at least 4.5', () => {
  expect(CSS).toContain('#ffffff');
  expect(CSS).toContain('rgba(10, 14, 30, 0.85)');
  expect(CSS).toContain('#ffd54a');
  const panel = composite([10, 14, 30], 0.85, [255, 255, 255]);
  expect(contrast([255, 255, 255], panel)).toBeGreaterThanOrEqual(4.5);
  expect(contrast([255, 213, 74], [0, 0, 0])).toBeGreaterThanOrEqual(3);
  expect(contrast([255, 213, 74], panel)).toBeGreaterThanOrEqual(3);
});

test('pl.json keys', () => {
  const copy: Record<string, string> = {
    'app.title': 'Orbitka: Układ Słoneczny',
    'bodies.panel.title': 'Ciała niebieskie',
    'bodies.panel.collapse': 'Zwiń listę ciał',
    'bodies.panel.expand': 'Rozwiń listę ciał',
    'bodies.item.ariaLabel': 'Wybierz: {name}, {kind}',
    'bodies.sun.kind': 'gwiazda',
    'bodies.mercury.kind': 'planeta skalista',
    'bodies.venus.kind': 'planeta skalista',
    'bodies.earth.kind': 'planeta skalista',
    'bodies.mars.kind': 'planeta skalista',
    'bodies.jupiter.kind': 'gazowy olbrzym',
    'bodies.saturn.kind': 'gazowy olbrzym',
    'bodies.uranus.kind': 'lodowy olbrzym',
    'bodies.neptune.kind': 'lodowy olbrzym',
    'selection.announce.selected': 'Wybrano: {name}. Kamera przybliżona.',
    'selection.announce.system': 'Widok całego układu.',
  };
  for (const [key, value] of Object.entries(copy)) {
    expect(messages[key]).toBe(value);
  }
  for (const id of ORDER) {
    const kind = messages[`bodies.${id}.kind`];
    expect(typeof kind).toBe('string');
    const words = String(kind).trim().split(/\s+/u);
    expect(words.length).toBeGreaterThanOrEqual(1);
    expect(words.length).toBeLessThanOrEqual(3);
    expect(String(kind)).not.toMatch(/\d/u);
  }
});

test('missing kind throws', () => {
  reset();
  const dictionary: Record<string, unknown> = { ...pl };
  delete dictionary['bodies.mars.kind'];
  const partial = createI18n(dictionary as Dictionary, 'pl-PL');
  const bodies: SelectableBody[] = [
    { id: 'mars', type: 'planet', radiusKm: 1 },
  ];
  expect(() =>
    createBodiesPanel(document.body, {
      bodies,
      selection: createSelection(['mars']),
      i18n: partial as I18n<Dictionary>,
    }),
  ).toThrow('i18n: missing key "bodies.mars.kind"');
});

test('dispose cleans up', () => {
  reset();
  const { panel, selection } = mount(getSelectableBodies(catalog));
  panel.dispose();
  expect(panel.element.isConnected).toBe(false);
  expect(() => selection.select('earth')).not.toThrow();
  expect(document.querySelector('#bodies-panel')).toBeNull();
  panel.dispose();
});

test('setCollapsed same value is a no-op', () => {
  reset();
  const { panel } = mount(getSelectableBodies(catalog));
  const toggle = document.querySelector('#bodies-collapse');
  const label = toggle?.getAttribute('aria-label');
  panel.setCollapsed(false);
  expect(panel.isCollapsed()).toBe(false);
  expect(toggle?.getAttribute('aria-label')).toBe(label);
  expect(toggle?.getAttribute('aria-expanded')).toBe('true');
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
