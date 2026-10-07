// @vitest-environment jsdom

import { expect, test, vi } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import { type MatchMedia } from '@core/reducedMotion.ts';
import { createSelection, type Selection } from '@core/selection.ts';
import { type SelectableBody } from '@core/selectableBodies.ts';
import { VIEW_CONFIG } from '@core/viewConfig.ts';
import { createBodiesDrawer, type BodiesDrawer } from '@ui/bodiesDrawer.ts';
import { createBodiesPanel, type BodiesPanel } from '@ui/bodiesPanel.ts';
import { createI18n } from '@ui/i18n.ts';

const i18n = createI18n(pl, 'pl-PL');

const BODIES: readonly SelectableBody[] = [
  { id: 'sun', type: 'star', radiusKm: 696340 },
  { id: 'mars', type: 'planet', radiusKm: 3389.5 },
];

type MediaControl = {
  matches: boolean;
  listeners: Array<() => void>;
  queries: string[];
  set(matches: boolean): void;
};

function installMedia(matches: boolean): {
  matchMedia: MatchMedia;
  media: MediaControl;
} {
  const media: MediaControl = {
    matches,
    listeners: [],
    queries: [],
    set(next: boolean) {
      media.matches = next;
      for (const listener of [...media.listeners]) {
        listener();
      }
    },
  };
  const matchMedia: MatchMedia = (query) => {
    media.queries.push(query);
    return {
      get matches() {
        return media.matches;
      },
      addEventListener(_type: 'change', listener: () => void) {
        media.listeners.push(listener);
      },
      removeEventListener(_type: 'change', listener: () => void) {
        const index = media.listeners.indexOf(listener);
        if (index >= 0) {
          media.listeners.splice(index, 1);
        }
      },
    };
  };
  return { matchMedia, media };
}

function mount(matches: boolean): {
  selection: Selection;
  panel: BodiesPanel;
  drawer: BodiesDrawer;
  media: MediaControl;
  root: HTMLElement;
} {
  const { matchMedia, media } = installMedia(matches);
  const selection = createSelection(BODIES.map((body) => body.id));
  let drawer: BodiesDrawer | null = null;
  const panel = createBodiesPanel(document.body, {
    bodies: BODIES,
    selection,
    i18n,
    getFocusFallback: () => drawer?.getFocusFallback() ?? null,
  });
  drawer = createBodiesDrawer(document.body, {
    panel,
    selection,
    i18n,
    matchMedia,
  });
  const root = drawer.openButton.parentElement;
  if (root === null) {
    throw new Error('drawer open button is not connected');
  }
  return { selection, panel, drawer, media, root };
}

function item(id: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    `[data-testid="body-item-${id}"]`,
  );
  if (button === null) {
    throw new Error(`missing body item ${id}`);
  }
  return button;
}

function drawerElement(): HTMLElement {
  const drawer = document.querySelector<HTMLElement>('#bodies-drawer');
  if (drawer === null) {
    throw new Error('missing bodies drawer');
  }
  return drawer;
}

function closeButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    '[data-testid="bodies-drawer-close"]',
  );
  if (button === null) {
    throw new Error('missing drawer close button');
  }
  return button;
}

function pressEscape(target: EventTarget): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

test('tablet mode hides panel and shows open button', () => {
  document.body.replaceChildren();
  const view = mount(true);

  expect(view.media.queries).toEqual([
    `(max-width: ${VIEW_CONFIG.tabletMaxWidthPx}px)`,
  ]);
  expect(view.drawer.openButton.hidden).toBe(false);
  expect(view.drawer.openButton.getAttribute('aria-expanded')).toBe('false');
  expect(view.drawer.openButton.getAttribute('aria-controls')).toBe(
    'bodies-drawer',
  );
  expect(drawerElement().hidden).toBe(true);
  expect(view.drawer.isOpen()).toBe(false);
  expect(view.panel.element.isConnected).toBe(true);

  view.drawer.dispose();
  view.panel.dispose();
});

test('open focuses selected item or first', () => {
  document.body.replaceChildren();
  const view = mount(true);
  const outside = document.createElement('button');
  document.body.append(outside);

  view.drawer.open();
  expect(view.drawer.openButton.getAttribute('aria-expanded')).toBe('true');
  expect(view.drawer.isOpen()).toBe(true);
  expect(document.activeElement).toBe(item('sun'));

  view.drawer.close();
  outside.focus();
  view.selection.select('mars');
  expect(view.drawer.isOpen()).toBe(false);
  expect(document.activeElement).toBe(outside);

  view.drawer.open();
  expect(document.activeElement).toBe(item('mars'));
  outside.focus();
  view.drawer.open();
  expect(document.activeElement).toBe(outside);

  view.drawer.dispose();
  view.panel.dispose();
  outside.remove();
});

test('closes after selection and focuses open button', () => {
  document.body.replaceChildren();
  const view = mount(true);
  const outside = document.createElement('button');
  document.body.append(outside);

  view.drawer.open();
  item('mars').focus();
  view.selection.select('mars');
  expect(view.drawer.isOpen()).toBe(false);
  expect(drawerElement().hidden).toBe(true);
  expect(document.activeElement).toBe(view.drawer.openButton);

  view.drawer.open();
  outside.focus();
  view.selection.select('sun');
  expect(view.drawer.isOpen()).toBe(false);
  expect(document.activeElement).toBe(outside);

  view.drawer.dispose();
  view.panel.dispose();
  outside.remove();
});

test('escape closes only when open', () => {
  document.body.replaceChildren();
  const addEventListener = vi.spyOn(document, 'addEventListener');
  const view = mount(true);
  expect(
    addEventListener.mock.calls.some((call) => call[0] === 'keydown'),
  ).toBe(false);
  addEventListener.mockRestore();

  const closedOnDrawer = pressEscape(drawerElement());
  const closedOnButton = pressEscape(view.drawer.openButton);
  expect(closedOnDrawer.defaultPrevented).toBe(false);
  expect(closedOnButton.defaultPrevented).toBe(false);
  expect(view.drawer.isOpen()).toBe(false);

  view.drawer.open();
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const onCanvas = pressEscape(canvas);
  const onDocument = pressEscape(document);
  expect(onCanvas.defaultPrevented).toBe(false);
  expect(onDocument.defaultPrevented).toBe(false);
  expect(view.drawer.isOpen()).toBe(true);

  const onButton = pressEscape(view.drawer.openButton);
  expect(onButton.defaultPrevented).toBe(true);
  expect(view.drawer.isOpen()).toBe(false);
  expect(document.activeElement).toBe(view.drawer.openButton);

  view.drawer.open();
  const onDrawer = pressEscape(drawerElement());
  expect(onDrawer.defaultPrevented).toBe(true);
  expect(view.drawer.isOpen()).toBe(false);
  expect(document.activeElement).toBe(view.drawer.openButton);

  canvas.remove();
  view.drawer.dispose();
  view.panel.dispose();
});

test('close button closes', () => {
  document.body.replaceChildren();
  const view = mount(true);

  view.drawer.open();
  document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(view.drawer.isOpen()).toBe(true);

  closeButton().click();
  expect(view.drawer.isOpen()).toBe(false);
  expect(drawerElement().hidden).toBe(true);
  expect(document.activeElement).toBe(view.drawer.openButton);

  view.drawer.dispose();
  view.panel.dispose();
});

test('system event focuses open button', () => {
  document.body.replaceChildren();
  const view = mount(true);

  view.selection.select('mars');
  expect(view.drawer.isOpen()).toBe(false);
  view.selection.showSystem();
  expect(document.activeElement).toBe(view.drawer.openButton);
  expect(view.selection.getSelectedId()).toBeNull();

  view.drawer.dispose();
  view.panel.dispose();
});

test('media change resets state', () => {
  document.body.replaceChildren();
  const view = mount(true);

  view.selection.select('mars');
  view.drawer.open();
  item('mars').focus();
  view.media.set(false);
  expect(view.drawer.openButton.hidden).toBe(true);
  expect(drawerElement().hidden).toBe(false);
  expect(view.drawer.isOpen()).toBe(false);
  expect(view.drawer.getFocusFallback()).toBeNull();
  expect(document.activeElement).toBe(item('mars'));
  expect(view.selection.getSelectedId()).toBe('mars');

  view.media.set(true);
  expect(view.drawer.openButton.hidden).toBe(false);
  expect(drawerElement().hidden).toBe(true);
  expect(view.drawer.isOpen()).toBe(false);
  expect(view.drawer.getFocusFallback()).toBe(view.drawer.openButton);
  expect(view.selection.getSelectedId()).toBe('mars');
  expect(item('mars').getAttribute('aria-pressed')).toBe('true');

  view.drawer.dispose();
  view.panel.dispose();
});

test('labels from i18n', () => {
  document.body.replaceChildren();
  const view = mount(true);

  expect(view.drawer.openButton.textContent).toBe('Ciała');
  expect(view.drawer.openButton.textContent).toBe(i18n.t('bodies.drawer.open'));
  expect(closeButton().textContent).toBe('Zamknij listę ciał');
  expect(closeButton().textContent).toBe(i18n.t('bodies.drawer.close'));

  view.drawer.dispose();
  view.panel.dispose();
});

test('open close idempotent; dispose cleans up', () => {
  document.body.replaceChildren();
  const view = mount(true);

  view.drawer.open();
  view.drawer.open();
  expect(view.drawer.isOpen()).toBe(true);
  view.drawer.close();
  view.drawer.close();
  expect(view.drawer.isOpen()).toBe(false);

  const listeners = view.media.listeners.length;
  expect(listeners).toBe(1);
  view.drawer.dispose();
  expect(view.drawer.openButton.isConnected).toBe(false);
  expect(document.querySelector('#bodies-drawer')).toBeNull();
  expect(view.media.listeners).toEqual([]);
  expect(() => view.drawer.dispose()).not.toThrow();
  expect(() => view.drawer.open()).not.toThrow();
  expect(() => view.drawer.close()).not.toThrow();
  expect(() => view.selection.select('sun')).not.toThrow();
  view.media.set(false);

  view.panel.dispose();
});
