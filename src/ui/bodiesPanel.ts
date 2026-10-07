import './bodiesPanel.css';

import { type SelectableBody } from '@core/selectableBodies.ts';
import { type Selection, type SelectionEvent } from '@core/selection.ts';

import { type Dictionary, type I18n } from './i18n.ts';

type AppI18n = I18n<Dictionary>;

export type BodiesPanel = {
  element: HTMLElement;
  setCollapsed(collapsed: boolean): void;
  isCollapsed(): boolean;
  focusItem(id: string): boolean;
  dispose(): void;
};

export type BodiesPanelOptions = {
  bodies: readonly SelectableBody[];
  selection: Selection;
  i18n: AppI18n;
  before?: Node;
  getFocusFallback?: () => HTMLElement | null;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

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

  const title = i18n.t('bodies.panel.title');
  const collapseLabel = i18n.t('bodies.panel.collapse');
  const expandLabel = i18n.t('bodies.panel.expand');

  const section = document.createElement('section');
  section.id = 'bodies-panel';
  section.setAttribute('aria-labelledby', 'bodies-panel-title');

  const bar = document.createElement('div');
  bar.className = 'bodies-panel-bar';

  const heading = document.createElement('h2');
  heading.id = 'bodies-panel-title';
  heading.textContent = title;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = 'bodies-collapse';
  toggle.setAttribute('data-testid', 'bodies-collapse');
  toggle.setAttribute('aria-expanded', 'true');
  toggle.setAttribute('aria-controls', 'bodies-list');
  toggle.setAttribute('aria-label', collapseLabel);
  toggle.append(chevron());

  bar.append(heading, toggle);

  const list = document.createElement('ul');
  list.id = 'bodies-list';

  const buttonById = new Map<string, HTMLButtonElement>();

  for (let index = 0; index < bodies.length; index += 1) {
    const body = bodies[index];
    if (body === undefined) {
      continue;
    }
    const name = i18n.t(`bodies.${body.id}.name`);
    const kind = i18n.t(`bodies.${body.id}.kind`);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bodies-item';
    button.setAttribute('data-testid', `body-item-${body.id}`);
    button.setAttribute('data-body-id', body.id);
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute(
      'aria-label',
      i18n.t('bodies.item.ariaLabel', { name, kind }),
    );

    const nameEl = document.createElement('span');
    nameEl.className = 'bodies-item-name';
    nameEl.textContent = name;

    const kindEl = document.createElement('span');
    kindEl.className = 'bodies-item-kind';
    kindEl.textContent = `, ${kind}`;

    button.append(nameEl, kindEl);
    const item = document.createElement('li');
    item.append(button);
    list.append(item);
    buttonById.set(body.id, button);
  }

  section.append(bar, list);
  section.addEventListener('click', onClick);
  parent.insertBefore(section, options.before ?? null);

  let collapsed = false;
  let disposed = false;
  let pressed: HTMLButtonElement | null = null;
  let hovered: HTMLButtonElement | null = null;

  const unsubscribe = selection.subscribe(onSelection);

  return {
    element: section,
    setCollapsed,
    isCollapsed: () => collapsed,
    focusItem,
    dispose,
  };

  function onClick(event: Event): void {
    if (disposed) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest('button');
    if (button === null || !section.contains(button)) {
      return;
    }
    if (button === toggle) {
      setCollapsed(!collapsed);
      return;
    }
    const id = button.getAttribute('data-body-id');
    if (id === null) {
      return;
    }
    selection.select(id);
  }

  function setCollapsed(next: boolean): void {
    if (disposed || next === collapsed) {
      return;
    }
    collapsed = next;
    list.hidden = next;
    toggle.classList.toggle('is-collapsed', next);
    toggle.setAttribute('aria-expanded', next ? 'false' : 'true');
    toggle.setAttribute('aria-label', next ? expandLabel : collapseLabel);
  }

  function focusItem(id: string): boolean {
    const button = buttonById.get(id);
    if (button === undefined || !isShown(button)) {
      return false;
    }
    button.focus();
    return document.activeElement === button;
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
      return;
    }
    applySelected(null);
    moveFocus(event.previousId);
  }

  function applyHover(id: string | null): void {
    if (id !== null && !buttonById.has(id)) {
      return;
    }
    if (hovered !== null) {
      hovered.classList.remove('is-hovered');
      hovered = null;
    }
    if (id === null) {
      return;
    }
    const button = buttonById.get(id);
    if (button === undefined) {
      return;
    }
    button.classList.add('is-hovered');
    hovered = button;
  }

  function applySelected(id: string | null): void {
    if (id !== null && !buttonById.has(id)) {
      return;
    }
    if (pressed !== null) {
      pressed.setAttribute('aria-pressed', 'false');
      pressed.classList.remove('is-selected');
      pressed = null;
    }
    if (id === null) {
      return;
    }
    const button = buttonById.get(id);
    if (button === undefined) {
      return;
    }
    button.setAttribute('aria-pressed', 'true');
    button.classList.add('is-selected');
    pressed = button;
  }

  function moveFocus(previousId: string | null): void {
    if (previousId === null) {
      return;
    }
    if (collapsed) {
      toggle.focus();
      return;
    }
    const button = buttonById.get(previousId);
    if (button !== undefined && isShown(button)) {
      button.focus();
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
    section.removeEventListener('click', onClick);
    section.remove();
  }
}

function chevron(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M4 6 L8 10 L12 6');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
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
