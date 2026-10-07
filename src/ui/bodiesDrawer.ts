import { type MatchMedia } from '@core/reducedMotion.ts';
import { type Selection, type SelectionEvent } from '@core/selection.ts';
import { VIEW_CONFIG } from '@core/viewConfig.ts';

import { type BodiesPanel } from './bodiesPanel.ts';
import { type Dictionary, type I18n } from './i18n.ts';

type AppI18n = I18n<Dictionary>;

export type BodiesDrawer = {
  openButton: HTMLButtonElement;
  isOpen(): boolean;
  open(): void;
  close(): void;
  getFocusFallback(): HTMLElement | null;
  dispose(): void;
};

export type BodiesDrawerOptions = {
  panel: BodiesPanel;
  selection: Selection;
  i18n: AppI18n;
  matchMedia: MatchMedia;
  before?: Node | null;
};

const TABLET_QUERY = `(max-width: ${VIEW_CONFIG.tabletMaxWidthPx}px)`;

export function createBodiesDrawer(
  parent: HTMLElement,
  options: BodiesDrawerOptions,
): BodiesDrawer {
  const { panel, selection, i18n, matchMedia } = options;
  const openLabel = i18n.t('bodies.drawer.open');
  const closeLabel = i18n.t('bodies.drawer.close');

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.id = 'bodies-drawer-open';
  openButton.setAttribute('data-testid', 'bodies-drawer-open');
  openButton.setAttribute('aria-controls', 'bodies-drawer');
  openButton.textContent = openLabel;

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.id = 'bodies-drawer-close';
  closeButton.setAttribute('data-testid', 'bodies-drawer-close');
  closeButton.textContent = closeLabel;

  const drawer = document.createElement('div');
  drawer.id = 'bodies-drawer';
  drawer.setAttribute('data-testid', 'bodies-drawer');
  drawer.append(closeButton, panel.element);

  parent.insertBefore(openButton, options.before ?? null);
  parent.insertBefore(drawer, options.before ?? null);

  const query = matchMedia(TABLET_QUERY);
  let disposed = false;
  let isTablet = query.matches;
  let openState = false;

  applyVisibility();
  query.addEventListener('change', onMediaChange);
  openButton.addEventListener('click', onOpenClick);
  openButton.addEventListener('keydown', onEscape);
  closeButton.addEventListener('click', onCloseClick);
  drawer.addEventListener('keydown', onEscape);
  const unsubscribe = selection.subscribe(onSelection);

  return {
    openButton,
    isOpen,
    open,
    close,
    getFocusFallback,
    dispose,
  };

  function isOpen(): boolean {
    return isTablet && openState;
  }

  function open(): void {
    if (disposed || !isTablet || openState) {
      return;
    }

    openState = true;
    closeButton.hidden = false;
    drawer.hidden = false;
    openButton.setAttribute('aria-expanded', 'true');
    focusSelectedOrFirst();
  }

  function close(): void {
    finishClose(true);
  }

  function getFocusFallback(): HTMLElement | null {
    if (disposed || !isTablet) {
      return null;
    }

    return openButton;
  }

  function dispose(): void {
    if (disposed) {
      return;
    }

    disposed = true;
    query.removeEventListener('change', onMediaChange);
    openButton.removeEventListener('click', onOpenClick);
    openButton.removeEventListener('keydown', onEscape);
    closeButton.removeEventListener('click', onCloseClick);
    drawer.removeEventListener('keydown', onEscape);
    unsubscribe();
    openButton.remove();
    drawer.remove();
  }

  function onOpenClick(): void {
    open();
  }

  function onCloseClick(): void {
    close();
  }

  function onEscape(event: KeyboardEvent): void {
    if (disposed || event.key !== 'Escape' || !openState) {
      return;
    }

    event.preventDefault();
    finishClose(true);
  }

  function onMediaChange(): void {
    if (disposed) {
      return;
    }

    setTablet(query.matches);
  }

  function onSelection(event: SelectionEvent): void {
    if (disposed || event.kind !== 'selected' || !isOpen()) {
      return;
    }

    const active = document.activeElement;
    const restore =
      active === openButton ||
      (active instanceof Node && drawer.contains(active));
    finishClose(restore);
  }

  function finishClose(restoreFocus: boolean): void {
    if (disposed || !openState) {
      return;
    }

    openState = false;
    if (restoreFocus) {
      openButton.focus();
    }
    drawer.hidden = true;
    openButton.setAttribute('aria-expanded', 'false');
  }

  function focusSelectedOrFirst(): void {
    const selectedId = selection.getSelectedId();
    if (selectedId !== null && panel.focusItem(selectedId)) {
      return;
    }

    const first = panel.element.querySelector<HTMLElement>('.bodies-item');
    first?.focus();
  }

  function applyVisibility(): void {
    openState = false;
    openButton.setAttribute('aria-expanded', 'false');
    if (isTablet) {
      drawer.hidden = true;
      openButton.hidden = false;
      closeButton.hidden = false;
      return;
    }

    drawer.hidden = false;
    openButton.hidden = true;
    closeButton.hidden = true;
  }

  function setTablet(next: boolean): void {
    if (disposed || next === isTablet) {
      return;
    }

    if (next) {
      const active = document.activeElement;
      const inside = active instanceof Node && drawer.contains(active);
      openButton.hidden = false;
      if (inside) {
        openButton.focus();
      }
      isTablet = true;
      openState = false;
      drawer.hidden = true;
      closeButton.hidden = false;
      openButton.setAttribute('aria-expanded', 'false');
      return;
    }

    const onOpenButton = document.activeElement === openButton;
    isTablet = false;
    openState = false;
    drawer.hidden = false;
    closeButton.hidden = true;
    openButton.setAttribute('aria-expanded', 'false');
    if (onOpenButton) {
      focusSelectedOrFirst();
    }
    openButton.hidden = true;
  }
}
