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

export type BodyCardInteriorLayer = {
  id: string;
  name: string;
  text: string;
  measure: 'thickness' | 'radius';
  km: number;
  color: string;
};

export type BodyCardInterior = {
  atmosphere: boolean;
  sourceName: string;
  sourceUrl: string;
  layers: readonly BodyCardInteriorLayer[];
};

export type BodyCardCutawayState = {
  active: boolean;
  bodyId: string | null;
  layerId: string | null;
};

/** A planet's pull from the Sun and orbital speed, for the gravity view. */
export type BodyCardMotion = {
  accelerationMs2: number;
  speedKms: number;
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
  /** Bodies that have a cutaway. Missing ids show the "not yet" line. */
  interiors?: Readonly<Record<string, BodyCardInterior>>;
  /** Open the cutaway as soon as a body is shown (a shared link). */
  initialCutaway?: boolean;
  onCutaway?(state: BodyCardCutawayState): void;
};

export type BodyCard = {
  readonly element: HTMLElement;
  show(id: string): void;
  hide(): void;
  isCutawayOpen(): boolean;
  /** The body whose content is on the card, or null when it is closed. */
  shownBodyId(): string | null;
  /**
   * The pull and speed rows of the shown planet (EMI-265); null hides them.
   * The text is rewritten only when the rounded value changes.
   */
  setMotion(motion: BodyCardMotion | null): void;
  dispose(): void;
};

// The card slides in after 60 % of the camera flight (SPEC §6).
export const CARD_ENTER_DELAY_MS =
  0.6 * CAMERA_CONFIG.flightToBodySeconds * 1000;
// Gap between the card and the free area of the scene (EMI-200 point 6).
const CARD_GAP_PX = 16;
// A handle drag shorter than this is a tap.
const TAP_SLOP_PX = 6;
// Content of an open card fades in when the body changes: --dur (220 ms),
// 150 ms with reduced motion. The card itself does not move.
const SWAP_FADE_MS = 220;
const SWAP_FADE_REDUCED_MS = 150;

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
  // Shown only in the gravity view (EMI-265).
  const accelerationRow = factRow(i18n.t('card.motion.acceleration'));
  accelerationRow.row.setAttribute('data-testid', 'body-card-acceleration');
  const speedRow = factRow(i18n.t('card.motion.speed'));
  speedRow.row.setAttribute('data-testid', 'body-card-speed');
  accelerationRow.row.hidden = true;
  speedRow.row.hidden = true;
  facts.append(accelerationRow.row, speedRow.row);
  const funFact = create('div', 'body-card-fun');
  const funText = create('p', 'body-card-fun-text');
  const source = create('a', 'body-card-source');
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  funFact.append(funText, source);
  const interior = create('section', 'body-card-interior');
  interior.hidden = true;
  interior.setAttribute('data-testid', 'body-card-interior');
  const interiorList = create('ul', 'body-card-interior-list');
  interiorList.setAttribute('aria-label', i18n.t('interior.legend'));
  const interiorThickness = create('p', 'body-card-interior-notice');
  interiorThickness.textContent = i18n.t('interior.notice.thickness');
  const interiorSurface = create('p', 'body-card-interior-notice');
  interiorSurface.textContent = i18n.t('interior.notice.noSurface');
  const interiorSource = create('a', 'body-card-source');
  interiorSource.target = '_blank';
  interiorSource.rel = 'noopener noreferrer';
  interior.append(
    interiorList,
    interiorThickness,
    interiorSurface,
    interiorSource,
  );
  const interiorMissing = create('p', 'body-card-interior-missing');
  interiorMissing.hidden = true;
  interiorMissing.setAttribute('data-testid', 'body-card-interior-missing');
  interiorMissing.textContent = i18n.t('interior.missing');
  const description = create('p', 'body-card-description');
  description.id = 'card-description';
  description.hidden = true;
  scroll.append(
    gaugeSlot,
    facts,
    interior,
    interiorMissing,
    funFact,
    description,
  );

  const actions = create('div', 'body-card-actions');
  const cutawayButton = create(
    'button',
    'o-btn o-btn--outline o-toggle body-card-cutaway',
  );
  cutawayButton.type = 'button';
  cutawayButton.hidden = true;
  cutawayButton.setAttribute('aria-pressed', 'false');
  cutawayButton.setAttribute('aria-label', i18n.t('interior.toggle.ariaLabel'));
  cutawayButton.setAttribute('data-testid', 'body-card-cutaway');
  cutawayButton.append(textSpan(i18n.t('interior.toggle')));
  const system = create('button', 'o-btn o-btn--outline body-card-system');
  system.type = 'button';
  system.setAttribute('data-testid', 'body-card-system');
  system.append(createIcon('system'), textSpan(i18n.t('card.system')));
  const more = create('button', 'o-btn o-btn--ghost body-card-more');
  more.type = 'button';
  more.setAttribute('aria-expanded', 'false');
  more.setAttribute('aria-controls', 'card-description');
  more.setAttribute('data-testid', 'body-card-more');
  const moreText = textSpan(i18n.t('card.more'));
  more.append(moreText);
  actions.append(cutawayButton, system, more);

  element.append(handle, head, scroll, actions);
  parent.insertBefore(element, options.before ?? null);

  const gauges = new Map<string, HTMLElement>();
  const interiors = options.interiors ?? {};
  let cutaway = options.initialCutaway === true;
  let highlighted: string | null = null;
  // A layer under the mouse shows in the scene until the pointer leaves.
  let previewed: string | null = null;
  let shownId: string | null = null;
  let pendingId: string | null = null;
  let enterTimer: ReturnType<typeof setTimeout> | null = null;
  let sheet = options.isTablet();
  let expanded = false;
  let descriptionOpen = false;
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
  cutawayButton.addEventListener('click', onCutawayClick);
  system.addEventListener('click', onCloseClick);
  more.addEventListener('click', onMoreClick);
  handle.addEventListener('click', onHandleClick);
  handle.addEventListener('pointerdown', onHandleDown);
  handle.addEventListener('pointerup', onHandleUp);
  handle.addEventListener('pointercancel', onHandleCancel);
  element.addEventListener('keydown', onKeyDown);
  interiorList.addEventListener('click', onLayerClick);
  interiorList.addEventListener('pointerover', onLayerOver);
  interiorList.addEventListener('pointerleave', onLayerLeave);
  element.classList.toggle('is-sheet', sheet);
  handle.hidden = !sheet;
  setExpanded(false);

  return {
    element,
    show,
    hide,
    isCutawayOpen,
    shownBodyId,
    setMotion,
    dispose,
  };

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

    const swapping = !element.hidden && shownId !== null && shownId !== id;
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

    if (shownId !== body.id) {
      highlighted = null;
      previewed = null;
      // The rows wait for the values of the new body.
      setMotion(null);
    }
    shownId = body.id;
    renderInterior();
    element.hidden = false;
    publishCutaway();
    writeInsets();
    if (swapping) {
      fadeInContent();
    }
  }

  function fadeInContent(): void {
    const duration =
      options.reducedMotion?.matches === true
        ? SWAP_FADE_REDUCED_MS
        : SWAP_FADE_MS;
    for (const part of [head, scroll]) {
      // jsdom has no Web Animations API; the content simply changes there.
      if (typeof part.animate === 'function') {
        part.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration,
          easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        });
      }
    }
  }

  function hide(): void {
    if (disposed) {
      return;
    }
    cancelEnter();
    pendingId = null;
    shownId = null;
    highlighted = null;
    previewed = null;
    setMotion(null);
    renderInterior();
    element.hidden = true;
    publishCutaway();
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
    cutawayButton.removeEventListener('click', onCutawayClick);
    interiorList.removeEventListener('click', onLayerClick);
    interiorList.removeEventListener('pointerover', onLayerOver);
    interiorList.removeEventListener('pointerleave', onLayerLeave);
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

  function isCutawayOpen(): boolean {
    return cutaway;
  }

  function shownBodyId(): string | null {
    return shownId;
  }

  function setMotion(motion: BodyCardMotion | null): void {
    if (disposed) {
      return;
    }
    accelerationRow.row.hidden = motion === null;
    speedRow.row.hidden = motion === null;
    if (motion === null) {
      return;
    }
    writeText(
      accelerationRow.value,
      i18n.t('card.motion.accelerationValue', {
        value: formatAcceleration(motion.accelerationMs2, i18n),
      }),
    );
    writeText(
      speedRow.value,
      i18n.t('card.motion.speedValue', {
        value: i18n.formatNumber(motion.speedKms, 1),
      }),
    );
  }

  function publishCutaway(): void {
    options.onCutaway?.({
      active: cutaway,
      bodyId: shownId,
      layerId: cutaway ? (previewed ?? highlighted) : null,
    });
  }

  function renderInterior(): void {
    const entry = shownId === null ? undefined : interiors[shownId];
    const showButton = entry !== undefined || (cutaway && shownId !== null);
    cutawayButton.hidden = !showButton;
    cutawayButton.setAttribute('aria-pressed', cutaway ? 'true' : 'false');
    const open = cutaway && shownId !== null && entry !== undefined;
    interior.hidden = !open;
    interiorMissing.hidden = !(
      cutaway &&
      shownId !== null &&
      entry === undefined
    );
    if (!open || entry === undefined) {
      interiorList.replaceChildren();
      return;
    }
    if (cutaway && sheet) {
      setExpanded(true);
    }
    interiorSurface.hidden = !entry.atmosphere;
    interiorSource.href = entry.sourceUrl;
    interiorSource.textContent = i18n.t('card.source', {
      name: entry.sourceName,
    });
    // Keep the buttons when only the highlight changes, so the keyboard
    // focus stays on the layer the student just pressed.
    if (layerListMatches(entry.layers)) {
      syncLayerPressed();
      return;
    }
    interiorList.replaceChildren(
      ...entry.layers.map((layer) => layerItem(layer)),
    );
    interiorList.classList.toggle('has-highlight', highlighted !== null);
  }

  function layerListMatches(layers: readonly BodyCardInteriorLayer[]): boolean {
    const buttons = interiorList.querySelectorAll('[data-layer]');
    if (buttons.length !== layers.length) {
      return false;
    }
    return layers.every(
      (layer, index) => buttons[index]?.getAttribute('data-layer') === layer.id,
    );
  }

  function syncLayerPressed(): void {
    interiorList.classList.toggle('has-highlight', highlighted !== null);
    for (const button of interiorList.querySelectorAll<HTMLButtonElement>(
      '[data-layer]',
    )) {
      button.setAttribute(
        'aria-pressed',
        button.dataset['layer'] === highlighted ? 'true' : 'false',
      );
    }
  }

  function layerItem(layer: BodyCardInteriorLayer): HTMLLIElement {
    const item = create('li', 'body-card-interior-layer');
    const button = create('button', 'body-card-interior-button');
    button.type = 'button';
    button.setAttribute('data-testid', `interior-layer-${layer.id}`);
    button.setAttribute('data-layer', layer.id);
    button.style.setProperty('--layer-color', layer.color);
    button.setAttribute(
      'aria-pressed',
      highlighted === layer.id ? 'true' : 'false',
    );
    const swatch = create('span', 'body-card-interior-swatch');
    swatch.style.backgroundColor = layer.color;
    swatch.setAttribute('aria-hidden', 'true');
    const name = create('span', 'body-card-interior-name');
    name.textContent = layer.name;
    const measure = create('span', 'body-card-interior-measure');
    const km = i18n.formatNumber(layer.km, 0);
    measure.textContent = i18n.t(
      layer.measure === 'radius'
        ? 'interior.layer.radius'
        : 'interior.layer.thickness',
      { km },
    );
    button.append(swatch, name, measure);
    const text = create('p', 'body-card-interior-text');
    text.textContent = layer.text;
    item.append(button, text);
    return item;
  }

  function onCutawayClick(): void {
    if (disposed) {
      return;
    }
    cutaway = !cutaway;
    if (!cutaway) {
      highlighted = null;
      previewed = null;
    }
    renderInterior();
    publishCutaway();
  }

  function onLayerClick(event: Event): void {
    if (disposed) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>('[data-layer]');
    const layerId = button?.dataset['layer'];
    if (button === undefined || layerId === undefined) {
      return;
    }
    highlighted = highlighted === layerId ? null : layerId;
    renderInterior();
    publishCutaway();
  }

  function onLayerOver(event: PointerEvent): void {
    if (disposed || event.pointerType !== 'mouse') {
      return;
    }
    const target = event.target;
    const button =
      target instanceof Element
        ? target.closest<HTMLButtonElement>('[data-layer]')
        : null;
    const next = button?.dataset['layer'] ?? null;
    if (next === previewed) {
      return;
    }
    previewed = next;
    publishCutaway();
  }

  function onLayerLeave(): void {
    if (disposed || previewed === null) {
      return;
    }
    previewed = null;
    publishCutaway();
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

  // The desktop card has room for the description, so it is always shown and
  // has no "more" button (EMI-240). The sheet keeps the toggle.
  function setDescription(open: boolean): void {
    descriptionOpen = open;
    more.setAttribute('aria-expanded', open ? 'true' : 'false');
    moreText.textContent = i18n.t(open ? 'card.less' : 'card.more');
    applyDescription();
  }

  function applyDescription(): void {
    description.hidden = sheet && !descriptionOpen;
    more.hidden = !sheet;
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
    applyDescription();
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

/** An acceleration to two significant digits ("0,0059", "0,0000067"). */
export function formatAcceleration(value: number, i18n: AppI18n): string {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(
      `formatAcceleration: parameter "value" must be finite and > 0, got ${value}`,
    );
  }
  const digits = Math.max(0, 1 - Math.floor(Math.log10(value)));
  return i18n.formatNumber(value, digits);
}

function writeText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) {
    element.textContent = text;
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
