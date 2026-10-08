import './bodiesPanel.css';

import {
  BODY_GROUP_ORDER,
  bodyGroup,
  formatAu,
  type BodyGroup,
} from '@core/bodyGroups.ts';
import { type Selection, type SelectionEvent } from '@core/selection.ts';

import { type Dictionary, type I18n } from './i18n.ts';
import { createIcon } from './icons.ts';
import { createTooltip, type Tooltip } from './tooltip.ts';

type AppI18n = I18n<Dictionary>;

/** `list`: groups with names and AU. `rail`: the 56 px strip of dots. */
export type BodiesPanelMode = 'list' | 'rail';

export type BodiesPanelBody = {
  id: string;
  /** `visual.color` from bodies.json. */
  color: string;
  /** Semi-major axis in AU; null for the Sun. */
  axisAu: number | null;
};

export type BodiesPanel = {
  element: HTMLElement;
  setMode(mode: BodiesPanelMode): void;
  getMode(): BodiesPanelMode;
  /** The user folded the list with its own button (SPEC §5.4). */
  isUserCollapsed(): boolean;
  /**
   * Adds or removes the fold button. The tablet drawer has no rail, so its
   * only control in the head is its own ✕ (SPEC §5.4).
   */
  setCollapsible(collapsible: boolean): void;
  /** The list head, where the drawer puts its ✕. */
  head: HTMLElement;
  focusItem(id: string): boolean;
  dispose(): void;
};

export type BodiesPanelOptions = {
  bodies: readonly BodiesPanelBody[];
  selection: Selection;
  i18n: AppI18n;
  before?: Node;
  getFocusFallback?: () => HTMLElement | null;
  /** Renders the fold button. Default true. */
  collapsible?: boolean;
  /**
   * Called after the fold button changes `isUserCollapsed()`; the owner
   * works out the mode again. Without it the panel follows the button alone.
   */
  onUserCollapsedChange?: () => void;
};

type ItemView = {
  id: string;
  button: HTMLButtonElement;
  listLabel: string;
  railLabel: string;
  tooltip: Tooltip | null;
};

export function createBodiesPanel(
  parent: HTMLElement,
  options: BodiesPanelOptions,
): BodiesPanel {
  const { bodies, selection, i18n } = options;
  if (bodies.length === 0) {
    throw new RangeError(
      'createBodiesPanel: parameter "bodies" must contain at least one body, got 0',
    );
  }

  const collapseLabel = i18n.t('bodies.panel.collapse');
  const expandLabel = i18n.t('bodies.panel.expand');

  const nav = document.createElement('nav');
  nav.id = 'bodies-panel';
  nav.className = 'o-glass';
  nav.setAttribute('aria-label', i18n.t('bodies.panel.title'));

  const head = document.createElement('div');
  head.className = 'bodies-head';
  const heading = document.createElement('h2');
  heading.id = 'bodies-panel-title';
  heading.textContent = i18n.t('bodies.panel.title');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = 'bodies-collapse';
  toggle.className = 'o-btn o-btn--ghost';
  toggle.setAttribute('data-testid', 'bodies-collapse');
  toggle.setAttribute('aria-controls', 'bodies-list');
  const foldIcon = createIcon('chevron');
  foldIcon.classList.add('bodies-fold-icon');
  const listIcon = createIcon('list');
  listIcon.classList.add('bodies-list-icon');
  toggle.append(foldIcon, listIcon);
  head.append(heading);
  if (options.collapsible ?? true) {
    head.append(toggle);
  }

  const columnHead = document.createElement('div');
  columnHead.className = 'bodies-colhead';
  const columnText = document.createElement('span');
  columnText.textContent = i18n.t('bodies.column.distance');
  const info = document.createElement('button');
  info.type = 'button';
  info.className = 'bodies-info';
  info.setAttribute('data-testid', 'bodies-au-info');
  info.setAttribute('aria-label', i18n.t('bodies.au.ariaLabel'));
  info.append(createIcon('info'));
  columnHead.append(columnText, info);
  const auTip = createTooltip(info, auTipContent(i18n), 'right', {
    id: 'tip-au',
  });

  const list = document.createElement('div');
  list.id = 'bodies-list';

  const items: ItemView[] = [];
  const itemById = new Map<string, ItemView>();
  const groups = new Map<BodyGroup, BodiesPanelBody[]>();
  for (const body of bodies) {
    const group = bodyGroup(body.id);
    const members = groups.get(group) ?? [];
    members.push(body);
    groups.set(group, members);
  }
  for (const group of BODY_GROUP_ORDER) {
    const members = groups.get(group);
    if (members === undefined) {
      continue;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'bodies-group';
    wrapper.setAttribute('role', 'presentation');
    const title = document.createElement('div');
    title.className = 'bodies-group-title';
    title.id = `bodies-group-${group}`;
    title.textContent = i18n.t(`bodies.group.${group}`);
    wrapper.append(title);
    for (const body of members) {
      const view = createItem(body, title.id);
      wrapper.append(view.button);
      items.push(view);
      itemById.set(body.id, view);
    }
    list.append(wrapper);
  }

  nav.append(head, columnHead, list);
  nav.addEventListener('click', onClick);
  nav.addEventListener('keydown', onKeyDown);
  nav.addEventListener('focusin', onFocusIn);
  parent.insertBefore(nav, options.before ?? null);

  let mode: BodiesPanelMode = 'list';
  let overlay = false;
  let userCollapsed = false;
  let disposed = false;
  let current: ItemView | null = null;
  let hovered: ItemView | null = null;
  // Roving tabindex: the selected item, else the last focused, else the first.
  let tabStop: ItemView | null = items[0] ?? null;

  applyMode();
  applyTabStop();
  const unsubscribe = selection.subscribe(onSelection);

  return {
    element: nav,
    setMode,
    getMode: () => mode,
    isUserCollapsed: () => userCollapsed,
    setCollapsible,
    head,
    focusItem,
    dispose,
  };

  function createItem(body: BodiesPanelBody, groupTitleId: string): ItemView {
    const name = i18n.t(`bodies.${body.id}.name`);
    const kind = i18n.t(`bodies.${body.id}.kind`);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'o-item bodies-item';
    button.setAttribute('data-testid', `body-item-${body.id}`);
    button.setAttribute('data-body-id', body.id);
    button.setAttribute('aria-describedby', groupTitleId);

    const dot = document.createElement('span');
    dot.className = 'bodies-dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.style.background = body.color;

    const nameEl = document.createElement('span');
    nameEl.className = 'bodies-item-name';
    nameEl.textContent = name;

    button.append(dot, nameEl);
    if (body.axisAu !== null) {
      const au = document.createElement('span');
      au.className = 'bodies-item-au';
      au.textContent = i18n.t('bodies.au.value', {
        value: formatAu(body.axisAu, i18n.locale),
      });
      button.append(au);
    }
    return {
      id: body.id,
      button,
      listLabel: i18n.t('bodies.item.ariaLabel', { name, kind }),
      railLabel: name,
      tooltip: null,
    };
  }

  function setCollapsible(collapsible: boolean): void {
    if (disposed || collapsible === (toggle.parentNode === head)) {
      return;
    }
    if (collapsible) {
      heading.after(toggle);
      return;
    }
    toggle.remove();
  }

  function setMode(next: BodiesPanelMode): void {
    if (disposed) {
      return;
    }
    if (next === mode) {
      if (next === 'list' && overlay) {
        closeOverlay();
      }
      return;
    }
    mode = next;
    overlay = false;
    applyMode();
  }

  // The rail is the same nav and the same buttons: focus and selection stay
  // on the element that is already there.
  function applyMode(): void {
    const rail = mode === 'rail' && !overlay;
    nav.classList.toggle('is-rail', rail);
    nav.classList.toggle('is-overlay', mode === 'rail' && overlay);
    toggle.setAttribute('aria-expanded', rail ? 'false' : 'true');
    toggle.setAttribute('aria-label', rail ? expandLabel : collapseLabel);
    for (const view of items) {
      view.button.setAttribute(
        'aria-label',
        rail ? view.railLabel : view.listLabel,
      );
      if (rail && view.tooltip === null) {
        view.tooltip = createTooltip(view.button, view.railLabel, 'right', {
          describe: false,
        });
      } else if (!rail && view.tooltip !== null) {
        view.tooltip.dispose();
        view.tooltip = null;
      }
    }
    if (overlay) {
      document.addEventListener('pointerdown', onOutsidePointerDown, true);
    } else {
      document.removeEventListener('pointerdown', onOutsidePointerDown, true);
    }
  }

  function openOverlay(): void {
    overlay = true;
    applyMode();
  }

  function closeOverlay(): void {
    if (!overlay) {
      return;
    }
    overlay = false;
    applyMode();
  }

  function onToggle(): void {
    if (mode === 'rail' && overlay) {
      closeOverlay();
      return;
    }
    if (mode === 'list') {
      userCollapsed = true;
      notifyCollapsed();
      return;
    }
    userCollapsed = false;
    notifyCollapsed();
    // Still a rail: a body is selected on a narrow window. The full list
    // opens over the scene and leaves the card where it is.
    if (!disposed && mode === 'rail') {
      openOverlay();
    }
  }

  function notifyCollapsed(): void {
    if (options.onUserCollapsedChange !== undefined) {
      options.onUserCollapsedChange();
      return;
    }
    setMode(userCollapsed ? 'rail' : 'list');
  }

  function onClick(event: Event): void {
    if (disposed) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest('button');
    if (button === null || !nav.contains(button)) {
      return;
    }
    if (button === toggle) {
      onToggle();
      return;
    }
    const id = button.getAttribute('data-body-id');
    if (id === null) {
      return;
    }
    selection.select(id);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (disposed) {
      return;
    }
    if (event.key === 'Escape' && overlay) {
      event.preventDefault();
      event.stopPropagation();
      closeOverlay();
      return;
    }
    const view = itemFromTarget(event.target);
    if (view === null) {
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const index = items.indexOf(view);
      const next = items[event.key === 'ArrowDown' ? index + 1 : index - 1];
      next?.button.focus();
      return;
    }
    if (event.key === 'Escape' || event.key === 'Home') {
      if (selection.getSelectedId() === null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      selection.showSystem();
      // The return moves focus to the last selected item; keep it here.
      if (!disposed && isShown(view.button)) {
        view.button.focus();
      }
    }
  }

  function onFocusIn(event: FocusEvent): void {
    const view = itemFromTarget(event.target);
    if (view !== null) {
      tabStop = view;
      applyTabStop();
    }
  }

  function onOutsidePointerDown(event: PointerEvent): void {
    const target = event.target;
    if (target instanceof Node && nav.contains(target)) {
      return;
    }
    closeOverlay();
  }

  function itemFromTarget(target: EventTarget | null): ItemView | null {
    if (!(target instanceof Element)) {
      return null;
    }
    const id = target.getAttribute('data-body-id');
    return id === null ? null : (itemById.get(id) ?? null);
  }

  function applyTabStop(): void {
    for (const view of items) {
      view.button.tabIndex = view === tabStop ? 0 : -1;
    }
  }

  function focusItem(id: string): boolean {
    const view = itemById.get(id);
    if (view === undefined || !isShown(view.button)) {
      return false;
    }
    view.button.focus();
    return document.activeElement === view.button;
  }

  function onSelection(event: SelectionEvent): void {
    if (disposed) {
      return;
    }
    if (event.kind === 'hover') {
      applyHover(event.id);
      return;
    }
    if (event.kind === 'selected') {
      applySelected(event.id);
      closeOverlay();
      return;
    }
    applySelected(null);
    moveFocus(event.previousId);
  }

  function applyHover(id: string | null): void {
    if (id !== null && !itemById.has(id)) {
      return;
    }
    hovered?.button.classList.remove('is-hovered');
    hovered = id === null ? null : (itemById.get(id) ?? null);
    hovered?.button.classList.add('is-hovered');
  }

  function applySelected(id: string | null): void {
    if (id !== null && !itemById.has(id)) {
      return;
    }
    current?.button.removeAttribute('aria-current');
    current = id === null ? null : (itemById.get(id) ?? null);
    if (current === null) {
      return;
    }
    current.button.setAttribute('aria-current', 'true');
    tabStop = current;
    applyTabStop();
  }

  function moveFocus(previousId: string | null): void {
    if (previousId === null) {
      return;
    }
    const target = itemById.get(previousId)?.button;
    if (target !== undefined && isShown(target)) {
      target.focus();
      return;
    }
    const fallback = options.getFocusFallback?.() ?? null;
    if (fallback !== null) {
      fallback.focus();
    }
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    unsubscribe();
    nav.removeEventListener('click', onClick);
    nav.removeEventListener('keydown', onKeyDown);
    nav.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('pointerdown', onOutsidePointerDown, true);
    auTip.dispose();
    for (const view of items) {
      view.tooltip?.dispose();
      view.tooltip = null;
    }
    nav.remove();
  }
}

// "1 j.a." in bold, then the rest: two keys, two text nodes.
function auTipContent(i18n: AppI18n): Node {
  const content = document.createElement('span');
  const strong = document.createElement('strong');
  strong.textContent = i18n.t('bodies.au.tipStrong');
  content.append(strong, ` ${i18n.t('bodies.au.tipRest')}`);
  return content;
}

function isShown(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current !== null) {
    if (current.hidden) {
      return false;
    }
    current = current.parentElement;
  }
  return element.isConnected;
}
