import './bodyCard.css';

import type { BodyContentCatalog } from '@content/bodyContent.ts';
import { computeBodyFacts } from '@core/bodyFacts.ts';
import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import { type Selection, type SelectionEvent } from '@core/selection.ts';
import { resolveSheetDrag } from '@core/sheetGesture.ts';
import { type ViewInsetsStore } from '@core/viewInsets.ts';

import { createDiameterGauge } from './diameterGauge.ts';
import { formatDay, formatYear } from './formatFacts.ts';
import { type Dictionary, type I18n } from './i18n.ts';
import { createIcon } from './icons.ts';

type AppI18n = I18n<Dictionary>;

export type BodyCardBody = {
  id: string;
  type: string;
  contentKey: string;
  radiusKm: number;
  parentId: string | null;
  visual: { color: string };
  rotation: { periodHours: number };
  orbit?: { periodDays: number };
};

export type BodyCardOptions = {
  bodies: readonly BodyCardBody[];
  content: BodyContentCatalog;
  selection: Selection;
  insets: ViewInsetsStore;
  i18n: AppI18n;
  isTablet(): boolean;
  before?: Node | null;
  /** Without motion the card fades in at once instead of after the flight. */
  reducedMotion?: { readonly matches: boolean };
  /** Gets focus when the card is closed from inside it (the canvas). */
  focusOnClose?: HTMLElement | null;
};

export type BodyCard = {
  readonly element: HTMLElement;
  show(id: string): void;
  hide(): void;
  dispose(): void;
};

// The card slides in after 60 % of the camera flight (SPEC §6).
export const CARD_ENTER_DELAY_MS =
  0.6 * CAMERA_CONFIG.flightToBodySeconds * 1000;
// Gap between the card and the free area of the scene (EMI-200 point 6).
const CARD_GAP_PX = 16;
// A handle drag shorter than this is a tap.
const TAP_SLOP_PX = 6;

function create<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}

export function createBodyCard(
  parent: HTMLElement,
  options: BodyCardOptions,
): BodyCard {
  const { bodies, content, selection, insets, i18n } = options;
  const earth = bodies.find((body) => body.id === 'earth');
  if (earth === undefined) {
    throw new RangeError(
      'createBodyCard: parameter "bodies" must contain earth, got none',
    );
  }
  const earthBody: BodyCardBody = earth;

  // The skeleton is built once; show() swaps texts, the gauge and the colors.
  const element = create('section', 'o-glass body-card');
  element.id = 'body-card';
  element.setAttribute('aria-labelledby', 'card-title');
  element.setAttribute('data-testid', 'body-card');
  element.hidden = true;

  const handle = create('button', 'body-card-handle');
  handle.type = 'button';
  handle.setAttribute('aria-expanded', 'false');
  handle.setAttribute('aria-controls', 'body-card');
  handle.setAttribute('data-testid', 'body-card-handle');

  const head = create('header', 'body-card-head');
  const title = create('h2', 'body-card-title');
  title.id = 'card-title';
  const kind = create('p', 'body-card-kind');
  const kindDot = create('span', 'body-card-dot');
  kindDot.setAttribute('aria-hidden', 'true');
  const kindText = create('span', 'body-card-kind-text');
  kind.append(kindDot, kindText);
  const heading = create('div', 'body-card-heading');
  heading.append(title, kind);
  const close = create('button', 'o-btn o-btn--ghost body-card-close');
  close.type = 'button';
  close.setAttribute('aria-label', i18n.t('card.close.ariaLabel'));
  close.setAttribute('data-testid', 'body-card-close');
  close.append(createIcon('close'));
  head.append(heading, close);

  const scroll = create('div', 'body-card-scroll');
  scroll.setAttribute('data-testid', 'body-card-scroll');
  const gaugeSlot = create('div', 'body-card-gauge');
  const facts = create('dl', 'body-card-facts');
  const yearRow = factRow(i18n.t('card.facts.year'));
  const rotationRow = factRow(i18n.t('card.facts.rotation'));
  facts.append(yearRow.row, rotationRow.row);
  const funFact = create('div', 'body-card-fun');
  const funText = create('p', 'body-card-fun-text');
  const source = create('a', 'body-card-source');
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  funFact.append(funText, source);
  const description = create('p', 'body-card-description');
  description.id = 'card-description';
  description.hidden = true;
  scroll.append(gaugeSlot, facts, funFact, description);

  const actions = create('div', 'body-card-actions');
  const system = create('button', 'o-btn o-btn--outline body-card-system');
  system.type = 'button';
  system.setAttribute('data-testid', 'body-card-system');
  system.append(createIcon('system'), textSpan(i18n.t('card.system')));
  const more = create('button', 'o-btn o-btn--primary body-card-more');
  more.type = 'button';
  more.setAttribute('aria-expanded', 'false');
  more.setAttribute('aria-controls', 'card-description');
  more.setAttribute('data-testid', 'body-card-more');
  const moreText = textSpan(i18n.t('card.more'));
  more.append(moreText);
  actions.append(system, more);

  element.append(handle, head, scroll, actions);
  parent.insertBefore(element, options.before ?? null);

  const gauges = new Map<string, HTMLElement>();
  let shownId: string | null = null;
  let pendingId: string | null = null;
  let enterTimer: ReturnType<typeof setTimeout> | null = null;
  let sheet = options.isTablet();
  let expanded = false;
  let disposed = false;
  let dragStart: { y: number; time: number; pointerId: number } | null = null;
  let suppressClick = false;

  // The sheet changes height when it opens; the insets follow it.
  const observer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          writeInsets();
        });
  observer?.observe(element);
  const unsubscribe = selection.subscribe(onSelection);
  window.addEventListener('resize', onWindowResize);
  close.addEventListener('click', onCloseClick);
  system.addEventListener('click', onCloseClick);
  more.addEventListener('click', onMoreClick);
  handle.addEventListener('click', onHandleClick);
  handle.addEventListener('pointerdown', onHandleDown);
  handle.addEventListener('pointerup', onHandleUp);
  handle.addEventListener('pointercancel', onHandleCancel);
  element.addEventListener('keydown', onKeyDown);
  element.classList.toggle('is-sheet', sheet);
  handle.hidden = !sheet;
  setExpanded(false);

  return { element, show, hide, dispose };

  function show(id: string): void {
    if (disposed) {
      return;
    }
    const body = bodies.find((entry) => entry.id === id);
    if (body === undefined) {
      throw new RangeError(
        `bodyCard.show: parameter "id" must be a known body id, got ${id}`,
      );
    }
    const entry = content[body.contentKey];
    if (entry === undefined) {
      throw new RangeError(
        `bodyCard.show: parameter "contentKey" must have an entry in the content catalog, got ${body.contentKey}`,
      );
    }

    const bodyFacts = computeBodyFacts(body, earthBody);
    title.textContent = i18n.t(`bodies.${body.id}.name`);
    kindText.textContent = entry.kind;
    kindDot.style.backgroundColor = body.visual.color;

    let gauge = gauges.get(body.id);
    if (gauge === undefined) {
      gauge = createDiameterGauge(
        bodyFacts.diameterVsEarth,
        body,
        i18n,
        bodyFacts.isReference,
      );
      gauges.set(body.id, gauge);
    }
    gaugeSlot.replaceChildren(gauge);

    const year = formatYear(bodyFacts, body.orbit?.periodDays ?? null, i18n);
    // The Sun and the Moon have no year: the row leaves the list.
    if (year === null) {
      yearRow.row.remove();
    } else {
      yearRow.value.textContent = year;
      facts.prepend(yearRow.row);
    }
    rotationRow.value.textContent = formatDay(bodyFacts.dayHours, i18n);

    funText.textContent = entry.funFact.text;
    // The catalog accepts https only; anything else is not rendered as a link.
    if (entry.funFact.source.url.startsWith('https://')) {
      source.hidden = false;
      source.href = entry.funFact.source.url;
      source.textContent = i18n.t('card.source', {
        name: entry.funFact.source.name,
      });
    } else {
      source.hidden = true;
      source.removeAttribute('href');
    }
    description.textContent = entry.description;
    setDescription(false);

    shownId = body.id;
    element.hidden = false;
    writeInsets();
  }

  function hide(): void {
    if (disposed) {
      return;
    }
    cancelEnter();
    pendingId = null;
    shownId = null;
    element.hidden = true;
    setExpanded(false);
    insets.set({ right: 0, bottom: 0 });
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    hide();
    disposed = true;
    observer?.disconnect();
    unsubscribe();
    window.removeEventListener('resize', onWindowResize);
    close.removeEventListener('click', onCloseClick);
    system.removeEventListener('click', onCloseClick);
    more.removeEventListener('click', onMoreClick);
    handle.removeEventListener('click', onHandleClick);
    handle.removeEventListener('pointerdown', onHandleDown);
    handle.removeEventListener('pointerup', onHandleUp);
    handle.removeEventListener('pointercancel', onHandleCancel);
    element.removeEventListener('keydown', onKeyDown);
    gauges.clear();
    element.remove();
  }

  function onSelection(event: SelectionEvent): void {
    if (disposed) {
      return;
    }
    if (event.kind === 'system') {
      hide();
      return;
    }
    if (event.kind !== 'selected') {
      return;
    }
    // An open card swaps its content without a second entrance.
    if (!element.hidden) {
      show(event.id);
      return;
    }
    pendingId = event.id;
    cancelEnter();
    if (options.reducedMotion?.matches === true) {
      enterPending();
      return;
    }
    enterTimer = setTimeout(enterPending, CARD_ENTER_DELAY_MS);
  }

  function enterPending(): void {
    enterTimer = null;
    const id = pendingId;
    pendingId = null;
    if (id !== null) {
      show(id);
    }
  }

  function cancelEnter(): void {
    if (enterTimer !== null) {
      clearTimeout(enterTimer);
      enterTimer = null;
    }
  }

  function closeToSystem(): void {
    const returnFocus = element.contains(document.activeElement);
    selection.showSystem();
    if (returnFocus) {
      options.focusOnClose?.focus();
    }
  }

  function onCloseClick(): void {
    if (!disposed) {
      closeToSystem();
    }
  }

  function onMoreClick(): void {
    if (disposed) {
      return;
    }
    const next = more.getAttribute('aria-expanded') !== 'true';
    if (next && sheet && !expanded) {
      setExpanded(true);
    }
    setDescription(next);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (disposed || (event.key !== 'Escape' && event.key !== 'Home')) {
      return;
    }
    event.preventDefault();
    closeToSystem();
  }

  function onHandleClick(): void {
    if (disposed) {
      return;
    }
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    setExpanded(!expanded);
  }

  function onHandleDown(event: PointerEvent): void {
    dragStart = {
      y: event.clientY,
      time: event.timeStamp,
      pointerId: event.pointerId,
    };
  }

  function onHandleUp(event: PointerEvent): void {
    const start = dragStart;
    dragStart = null;
    if (disposed || start === null || start.pointerId !== event.pointerId) {
      return;
    }
    const delta = event.clientY - start.y;
    if (Math.abs(delta) < TAP_SLOP_PX) {
      return;
    }
    // The drag decides; the click that follows it is not a tap.
    suppressClick = true;
    const elapsed = Math.max(event.timeStamp - start.time, 1);
    setExpanded(resolveSheetDrag(expanded, delta, delta / elapsed));
  }

  function onHandleCancel(): void {
    dragStart = null;
  }

  function onWindowResize(): void {
    if (disposed) {
      return;
    }
    applyMode();
    writeInsets();
  }

  function setDescription(open: boolean): void {
    description.hidden = !open;
    more.setAttribute('aria-expanded', open ? 'true' : 'false');
    moreText.textContent = i18n.t(open ? 'card.less' : 'card.more');
  }

  function setExpanded(next: boolean): void {
    expanded = sheet && next;
    element.classList.toggle('is-expanded', expanded);
    handle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    handle.setAttribute(
      'aria-label',
      i18n.t(expanded ? 'card.sheet.collapse' : 'card.sheet.expand'),
    );
    writeInsets();
  }

  // 1280 -> 900 with the card open turns it into the sheet, and back.
  function applyMode(): void {
    const next = options.isTablet();
    if (next === sheet) {
      return;
    }
    sheet = next;
    element.classList.toggle('is-sheet', sheet);
    handle.hidden = !sheet;
    setExpanded(false);
  }

  function writeInsets(): void {
    if (disposed || element.hidden || shownId === null) {
      return;
    }
    // Layout box, not getBoundingClientRect: the entrance slide must not
    // leak into the insets (offsetLeft and offsetTop ignore transforms).
    if (sheet) {
      insets.set({
        right: 0,
        bottom: Math.max(0, window.innerHeight - element.offsetTop),
      });
      return;
    }
    insets.set({
      right: Math.max(0, window.innerWidth - element.offsetLeft + CARD_GAP_PX),
      bottom: 0,
    });
  }
}

function factRow(label: string): {
  row: HTMLDivElement;
  value: HTMLElement;
} {
  const row = document.createElement('div');
  row.className = 'body-card-fact';
  const term = document.createElement('dt');
  term.textContent = label;
  const value = document.createElement('dd');
  row.append(term, value);
  return { row, value };
}

function textSpan(text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}
