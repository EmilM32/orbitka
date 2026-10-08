// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { afterEach, expect, test, vi } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import { shouldShowRail } from '@core/bodiesRail.ts';
import { getSelectableBodies } from '@core/selectableBodies.ts';
import { createSelection, type Selection } from '@core/selection.ts';
import { bodies as catalog } from '@data/bodies.ts';
import {
  createBodiesPanel,
  type BodiesPanel,
  type BodiesPanelBody,
} from '@ui/bodiesPanel.ts';
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

// The same mapping main.ts makes from bodies.json.
function panelBodies(): BodiesPanelBody[] {
  return getSelectableBodies(catalog).map((body) => {
    const def = catalog.find((entry) => entry.id === body.id);
    return {
      id: body.id,
      color: def?.visual.color ?? '#ffffff',
      axisAu:
        def?.type === 'planet' ? (def.orbit?.semiMajorAxisAu ?? null) : null,
    };
  });
}

function reset(): void {
  document.body.replaceChildren();
}

afterEach(() => {
  vi.useRealTimers();
  reset();
});

function mount(
  bodies: readonly BodiesPanelBody[] = panelBodies(),
  selection = createSelection(bodies.map((body) => body.id)),
  options: {
    getFocusFallback?: () => HTMLElement | null;
    onUserCollapsedChange?: () => void;
  } = {},
): { panel: BodiesPanel; selection: Selection } {
  const panel = createBodiesPanel(document.body, {
    bodies,
    selection,
    i18n,
    ...options,
  });
  return { panel, selection };
}

// Wires the mode the way main.ts does at a 1280 px window.
function mountAt1280(): { panel: BodiesPanel; selection: Selection } {
  const bodies = panelBodies();
  const selection = createSelection(bodies.map((body) => body.id));
  const holder: { panel: BodiesPanel | null } = { panel: null };
  const update = (): void => {
    const panel = holder.panel;
    if (panel === null) {
      return;
    }
    panel.setMode(
      shouldShowRail({
        viewportWidthPx: 1280,
        hasSelection: selection.getSelectedId() !== null,
        userCollapsed: panel.isUserCollapsed(),
      })
        ? 'rail'
        : 'list',
    );
  };
  holder.panel = mount(bodies, selection, {
    onUserCollapsedChange: update,
  }).panel;
  selection.subscribe((event) => {
    if (event.kind !== 'hover') {
      update();
    }
  });
  return { panel: holder.panel, selection };
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

function toggle(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('#bodies-collapse');
  if (button === null) {
    throw new Error('missing collapse button');
  }
  return button;
}

function nav(): HTMLElement {
  const element = document.querySelector<HTMLElement>('#bodies-panel');
  if (element === null) {
    throw new Error('missing nav');
  }
  return element;
}

function key(target: HTMLElement, name: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

function currentIds(): string[] {
  return [...document.querySelectorAll<HTMLButtonElement>('.bodies-item')]
    .filter((button) => button.getAttribute('aria-current') === 'true')
    .map((button) => button.getAttribute('data-body-id') ?? '');
}

test('renders nav with groups and au values', () => {
  mount();
  const element = nav();
  expect(element.tagName).toBe('NAV');
  expect(element.getAttribute('aria-label')).toBe('Ciała niebieskie');
  expect(element.classList.contains('o-glass')).toBe(true);
  expect(document.querySelector('#bodies-panel-title')?.textContent).toBe(
    'Ciała niebieskie',
  );

  const groups = [...element.querySelectorAll('.bodies-group')];
  expect(groups.map((group) => group.getAttribute('role'))).toEqual([
    'presentation',
    'presentation',
    'presentation',
    'presentation',
  ]);
  expect(
    groups.map(
      (group) => group.querySelector('.bodies-group-title')?.textContent,
    ),
  ).toEqual([
    'Gwiazda',
    'Planety skaliste',
    'Gazowe olbrzymy',
    'Lodowe olbrzymy',
  ]);

  const buttons = [
    ...element.querySelectorAll<HTMLButtonElement>('.bodies-item'),
  ];
  expect(buttons.map((button) => button.dataset['bodyId'])).toEqual(ORDER);
  for (const button of buttons) {
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.hasAttribute('aria-pressed')).toBe(false);
    expect(button.classList.contains('o-item')).toBe(true);
    const titleId = button.getAttribute('aria-describedby') ?? '';
    expect(
      button.closest('.bodies-group')?.querySelector(`#${titleId}`),
    ).not.toBeNull();
  }

  const values = buttons.map(
    (button) => button.querySelector('.bodies-item-au')?.textContent ?? null,
  );
  expect(values).toEqual([
    null,
    '0,39 j.a.',
    '0,72 j.a.',
    '1,00 j.a.',
    '1,52 j.a.',
    '5,20 j.a.',
    '9,54 j.a.',
    '19,19 j.a.',
    '30,07 j.a.',
  ]);
  expect(
    item('mars').querySelector('.bodies-dot')?.getAttribute('style'),
  ).toMatch(/background/u);
  expect(document.querySelector('.bodies-colhead')?.textContent).toContain(
    'od Słońca',
  );
});

test('item labels', () => {
  mount();
  expect(item('mars').getAttribute('aria-label')).toBe(
    'Wybierz: Mars, planeta skalista',
  );
  expect(item('jupiter').getAttribute('aria-label')).toBe(
    'Wybierz: Jowisz, gazowy olbrzym',
  );
  expect(item('sun').getAttribute('aria-label')).toBe(
    'Wybierz: Słońce, gwiazda',
  );
  expect(item('earth').textContent).toContain('Ziemia');
});

test('au info button has the tooltip', () => {
  mount();
  const info = document.querySelector<HTMLButtonElement>(
    '[data-testid="bodies-au-info"]',
  );
  expect(info?.getAttribute('aria-label')).toBe('Co to jest j.a.?');
  expect(info?.getAttribute('aria-describedby')).toBe('tip-au');
  const tip = document.querySelector('#tip-au');
  expect(tip?.getAttribute('role')).toBe('tooltip');
  expect(tip?.querySelector('strong')?.textContent).toBe('1 j.a.');
  expect(tip?.textContent).toBe(
    '1 j.a. (jednostka astronomiczna) = odległość Ziemi od Słońca, ok. 150 mln km.',
  );
  info?.focus();
  expect((tip as HTMLElement | null)?.hidden).toBe(false);
  expect(SOURCE).not.toContain('innerHTML');
});

test('click selects', () => {
  const { selection } = mount();
  item('mars').click();
  expect(selection.getSelectedId()).toBe('mars');
});

test('selected item has aria-current', () => {
  const bodies = panelBodies();
  const selection = createSelection([
    ...bodies.map((body) => body.id),
    'pluto',
  ]);
  mount(bodies, selection);
  selection.select('mars');
  expect(currentIds()).toEqual(['mars']);
  item('earth').click();
  expect(currentIds()).toEqual(['earth']);
  selection.select('pluto');
  expect(currentIds()).toEqual(['earth']);
  selection.showSystem();
  expect(currentIds()).toEqual([]);
  expect(document.querySelectorAll('[aria-pressed]')).toHaveLength(0);
});

test('arrow keys move focus', () => {
  mount();
  const tabStops = (): string[] =>
    [...document.querySelectorAll<HTMLButtonElement>('.bodies-item')]
      .filter((button) => button.tabIndex === 0)
      .map((button) => button.dataset['bodyId'] ?? '');
  expect(tabStops()).toEqual(['sun']);

  item('sun').focus();
  key(item('sun'), 'ArrowUp');
  expect(document.activeElement).toBe(item('sun'));
  key(item('sun'), 'ArrowDown');
  expect(document.activeElement).toBe(item('mercury'));
  expect(tabStops()).toEqual(['mercury']);

  item('neptune').focus();
  key(item('neptune'), 'ArrowDown');
  expect(document.activeElement).toBe(item('neptune'));
});

test('selected item is the tab stop', () => {
  const { selection } = mount();
  selection.select('saturn');
  expect(item('saturn').tabIndex).toBe(0);
  expect(item('sun').tabIndex).toBe(-1);
});

test('Escape and Home show the system', () => {
  const { selection } = mount();
  const showSystem = vi.spyOn(selection, 'showSystem');

  item('mars').focus();
  const idle = key(item('mars'), 'Escape');
  expect(showSystem).not.toHaveBeenCalled();
  expect(idle.defaultPrevented).toBe(false);

  selection.select('jupiter');
  item('mars').focus();
  const escape = key(item('mars'), 'Escape');
  expect(showSystem).toHaveBeenCalledTimes(1);
  expect(escape.defaultPrevented).toBe(true);
  expect(selection.getSelectedId()).toBeNull();
  expect(document.activeElement).toBe(item('mars'));

  selection.select('jupiter');
  item('jupiter').focus();
  key(item('jupiter'), 'Home');
  expect(showSystem).toHaveBeenCalledTimes(2);
  expect(document.activeElement).toBe(item('jupiter'));
});

test('Escape with an open tooltip closes only the tooltip', () => {
  const { panel, selection } = mount();
  selection.select('jupiter');
  panel.setMode('rail');
  const dot = item('mars');
  dot.focus();
  const tip = document.querySelector<HTMLElement>('.o-tooltip:not(#tip-au)');
  const open = [...document.querySelectorAll<HTMLElement>('.o-tooltip')].find(
    (element) => !element.hidden,
  );
  expect(tip).not.toBeNull();
  expect(open?.textContent).toBe('Mars');
  key(dot, 'Escape');
  expect(open?.hidden).toBe(true);
  expect(selection.getSelectedId()).toBe('jupiter');
  key(dot, 'Escape');
  expect(selection.getSelectedId()).toBeNull();
});

test('focus returns to previous item on system', () => {
  const fallback = document.createElement('button');
  const outside = document.createElement('button');
  document.body.append(fallback, outside);
  const { panel, selection } = mount(panelBodies(), undefined, {
    getFocusFallback: () => fallback,
  });
  item('earth').click();
  outside.focus();
  selection.showSystem();
  expect(document.activeElement).toBe(item('earth'));

  item('earth').click();
  panel.element.hidden = true;
  outside.focus();
  selection.showSystem();
  expect(document.activeElement).toBe(fallback);
});

test('rail mode', () => {
  const { panel, selection } = mountAt1280();
  expect(panel.getMode()).toBe('list');
  expect(toggle().getAttribute('aria-expanded')).toBe('true');
  expect(toggle().getAttribute('aria-label')).toBe('Zwiń listę do paska');
  expect(toggle().getAttribute('aria-controls')).toBe('bodies-list');

  selection.select('jupiter');
  expect(panel.getMode()).toBe('rail');
  expect(nav().classList.contains('is-rail')).toBe(true);
  expect(toggle().getAttribute('aria-expanded')).toBe('false');
  expect(toggle().getAttribute('aria-label')).toBe('Rozwiń listę ciał');
  const dots = [
    ...document.querySelectorAll<HTMLButtonElement>('.bodies-item'),
  ];
  expect(dots).toHaveLength(9);
  expect(dots.map((dot) => dot.getAttribute('aria-label'))).toEqual([
    'Słońce',
    'Merkury',
    'Wenus',
    'Ziemia',
    'Mars',
    'Jowisz',
    'Saturn',
    'Uran',
    'Neptun',
  ]);
  expect(item('jupiter').getAttribute('aria-current')).toBe('true');
  // Nine name tooltips plus the AU one; none describes its dot twice.
  expect(document.querySelectorAll('.o-tooltip')).toHaveLength(10);
  expect(item('mars').hasAttribute('aria-describedby')).toBe(true);
  expect(item('mars').getAttribute('aria-describedby')).toBe(
    'bodies-group-rocky',
  );

  // Expand with a selection: the list opens over the scene.
  toggle().click();
  expect(panel.getMode()).toBe('rail');
  expect(nav().classList.contains('is-overlay')).toBe(true);
  expect(nav().classList.contains('is-rail')).toBe(false);
  expect(toggle().getAttribute('aria-expanded')).toBe('true');
  expect(item('mars').getAttribute('aria-label')).toBe(
    'Wybierz: Mars, planeta skalista',
  );

  item('saturn').click();
  expect(nav().classList.contains('is-overlay')).toBe(false);
  expect(nav().classList.contains('is-rail')).toBe(true);

  selection.showSystem();
  expect(panel.getMode()).toBe('list');
  expect(nav().classList.contains('is-rail')).toBe(false);
  expect(document.querySelectorAll('.o-tooltip')).toHaveLength(1);
});

test('overlay closes on Escape and outside pointer', () => {
  const { selection } = mountAt1280();
  selection.select('jupiter');
  toggle().click();
  expect(nav().classList.contains('is-overlay')).toBe(true);
  item('mars').focus();
  key(item('mars'), 'Escape');
  expect(nav().classList.contains('is-overlay')).toBe(false);
  expect(selection.getSelectedId()).toBe('jupiter');

  toggle().click();
  expect(nav().classList.contains('is-overlay')).toBe(true);
  const outside = document.createElement('div');
  document.body.append(outside);
  outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(nav().classList.contains('is-overlay')).toBe(false);

  toggle().click();
  toggle().click();
  expect(nav().classList.contains('is-overlay')).toBe(false);
});

test('user fold keeps the rail after the card closes', () => {
  const { panel, selection } = mountAt1280();
  toggle().click();
  expect(panel.getMode()).toBe('rail');
  selection.select('mars');
  selection.showSystem();
  expect(panel.getMode()).toBe('rail');
  // Expand without a selection: back to the full list, not an overlay.
  toggle().click();
  expect(panel.getMode()).toBe('list');
  expect(nav().classList.contains('is-overlay')).toBe(false);
});

test('fold button sets userCollapsed', () => {
  const onChange = vi.fn();
  const { panel } = mount(panelBodies(), undefined, {
    onUserCollapsedChange: onChange,
  });
  toggle().click();
  expect(panel.isUserCollapsed()).toBe(true);
  expect(onChange).toHaveBeenCalledTimes(1);
  // The owner decides the mode.
  expect(panel.getMode()).toBe('list');
  panel.setMode('rail');
  toggle().click();
  expect(panel.isUserCollapsed()).toBe(false);
  expect(onChange).toHaveBeenCalledTimes(2);

  reset();
  const alone = mount().panel;
  toggle().click();
  expect(alone.getMode()).toBe('rail');
  toggle().click();
  expect(alone.getMode()).toBe('list');
});

test('focus stays on the item when the mode changes', () => {
  const { panel, selection } = mount();
  item('mars').focus();
  selection.select('mars');
  panel.setMode('rail');
  expect(document.activeElement).toBe(item('mars'));
  panel.setMode('list');
  expect(document.activeElement).toBe(item('mars'));
});

test('hover class from selection', () => {
  const { selection } = mount();
  selection.setHovered('earth');
  expect(item('earth').classList.contains('is-hovered')).toBe(true);
  selection.setHovered('mars');
  expect(item('earth').classList.contains('is-hovered')).toBe(false);
  expect(item('mars').classList.contains('is-hovered')).toBe(true);
  selection.setHovered(null);
  expect(item('mars').classList.contains('is-hovered')).toBe(false);
});

test('empty list throws', () => {
  const selection = createSelection(['sun']);
  expect(() =>
    createBodiesPanel(document.body, { bodies: [], selection, i18n }),
  ).toThrow(
    new RangeError(
      'createBodiesPanel: parameter "bodies" must contain at least one body, got 0',
    ),
  );
});

test('unknown body id throws', () => {
  expect(() =>
    mount([{ id: 'pluto', color: '#ffffff', axisAu: 39.5 }]),
  ).toThrow('bodyGroup: parameter "id" must be a known body id, got pluto');
});

test('header panel canvas order', () => {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const header = createPageHeader(document.body, i18n, canvas);
  const bodies = panelBodies();
  createBodiesPanel(document.body, {
    bodies,
    selection: createSelection(bodies.map((body) => body.id)),
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
  expect(CSS).toContain('width: var(--list-w)');
  expect(CSS).toContain('width: var(--rail-w)');
  expect(CSS).toContain('left: var(--edge)');
  expect(CSS).toContain('transition: width var(--dur) var(--ease-out)');
  expect(CSS).toContain('transition: opacity var(--dur-fast) var(--ease-out)');
  // 38 px rows, 44 px on the tablet.
  expect(CSS).toContain('height: 2.375rem');
  expect(CSS).toMatch(
    /@media \(pointer: coarse\), \(max-width: 1024px\)\s*\{[^}]*\.bodies-item\s*\{[^}]*height:\s*var\(--hit\)/u,
  );
  expect(CSS).toContain('font-variant-numeric: tabular-nums');
  // Without motion: a fade, no running width.
  expect(CSS).toMatch(
    /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*transition:\s*none/u,
  );
  // Focus is the global ring from controls.css (EMI-217), never yellow.
  expect(CSS).not.toContain('focus-visible');
  expect(CSS).not.toContain('aria-pressed');
});

test('pl.json keys', () => {
  const copy: Record<string, string> = {
    'app.title': 'Orbitka: Układ Słoneczny',
    'bodies.panel.title': 'Ciała niebieskie',
    'bodies.panel.collapse': 'Zwiń listę do paska',
    'bodies.panel.expand': 'Rozwiń listę ciał',
    'bodies.drawer.open': 'Planety',
    'bodies.item.ariaLabel': 'Wybierz: {name}, {kind}',
    'bodies.group.star': 'Gwiazda',
    'bodies.group.rocky': 'Planety skaliste',
    'bodies.group.gas': 'Gazowe olbrzymy',
    'bodies.group.ice': 'Lodowe olbrzymy',
    'bodies.column.distance': 'od Słońca',
    'bodies.au.ariaLabel': 'Co to jest j.a.?',
    'bodies.au.tipStrong': '1 j.a.',
    'bodies.au.tipRest':
      '(jednostka astronomiczna) = odległość Ziemi od Słońca, ok. 150 mln km.',
    'bodies.au.value': '{value} j.a.',
    'selection.announce.selected': 'Wybrano: {name}. Kamera przybliżona.',
    'selection.announce.system': 'Widok całego układu.',
  };
  for (const [name, value] of Object.entries(copy)) {
    expect(messages[name]).toBe(value);
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
  const dictionary: Record<string, unknown> = { ...pl };
  delete dictionary['bodies.mars.kind'];
  const partial = createI18n(dictionary as Dictionary, 'pl-PL');
  expect(() =>
    createBodiesPanel(document.body, {
      bodies: [{ id: 'mars', color: '#c1440e', axisAu: 1.52 }],
      selection: createSelection(['mars']),
      i18n: partial as I18n<Dictionary>,
    }),
  ).toThrow('i18n: missing key "bodies.mars.kind"');
});

test('dispose cleans up', () => {
  const { panel, selection } = mount();
  panel.setMode('rail');
  panel.dispose();
  expect(panel.element.isConnected).toBe(false);
  expect(document.querySelectorAll('.o-tooltip')).toHaveLength(0);
  expect(() => selection.select('earth')).not.toThrow();
  expect(document.querySelector('#bodies-panel')).toBeNull();
  panel.dispose();
});

test('setMode same value is a no-op', () => {
  const { panel } = mount();
  const label = toggle().getAttribute('aria-label');
  panel.setMode('list');
  expect(panel.getMode()).toBe('list');
  expect(toggle().getAttribute('aria-label')).toBe(label);
  expect(toggle().getAttribute('aria-expanded')).toBe('true');
});

test('collapsible option renders the fold button', () => {
  document.body.replaceChildren();
  const selection = createSelection(['sun', 'mars']);
  const panel = createBodiesPanel(document.body, {
    bodies: [
      { id: 'sun', color: '#fdb813', axisAu: null },
      { id: 'mars', color: '#c1440e', axisAu: 1.52 },
    ],
    selection,
    i18n,
    collapsible: false,
  });

  expect(panel.element.querySelector('#bodies-collapse')).toBeNull();
  panel.setCollapsible(true);
  expect(panel.head.querySelector('#bodies-collapse')).not.toBeNull();
  expect(panel.head.firstElementChild?.id).toBe('bodies-panel-title');
  panel.setCollapsible(true);
  expect(panel.head.querySelectorAll('#bodies-collapse')).toHaveLength(1);
  panel.setCollapsible(false);
  expect(panel.element.querySelector('#bodies-collapse')).toBeNull();
  panel.dispose();
});
