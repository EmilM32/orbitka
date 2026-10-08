import './bodyLabels.css';

import { type BodyScreenFrame } from '@core/bodyScreenFrame.ts';
import {
  computeLabelOrder,
  LABEL_SIDE_RIGHT,
  labelCandidateOrigin,
  layoutLabels,
  leaderLine,
  rectHitsDisc,
  type LabelLayout,
} from '@core/labelLayout.ts';
import { type Selection, type SelectionEvent } from '@core/selection.ts';
import { VIEW_CONFIG } from '@core/viewConfig.ts';

import { type Dictionary, type I18n } from './i18n.ts';

type AppI18n = I18n<Dictionary>;

export type BodyLabels = {
  element: HTMLElement;
  update(widthCss: number, heightCss: number, dtSeconds: number): void;
  dispose(): void;
};

/** A body with a label: the Sun, the planets and their moons. */
export type LabelBody = {
  id: string;
  radiusKm: number;
  /** null for the Sun; `sun` for a planet; the planet for a moon. */
  parentId: string | null;
  /** `visual.color`, the dot in front of a planet name. */
  color: string;
};

export type BodyLabelsOptions = {
  bodies: readonly LabelBody[];
  selection: Selection;
  i18n: AppI18n;
  frame: BodyScreenFrame;
  measure?: (element: HTMLElement) => number;
  before?: Node;
};

const LAYOUT_INTERVAL_SECONDS = 1 / VIEW_CONFIG.labelLayoutHz;
const SVG_NS = 'http://www.w3.org/2000/svg';

function isMoon(body: LabelBody | undefined): boolean {
  return (
    body !== undefined && body.parentId !== null && body.parentId !== 'sun'
  );
}

export function createBodyLabels(
  parent: HTMLElement,
  options: BodyLabelsOptions,
): BodyLabels {
  const { bodies, selection, i18n, frame } = options;
  if (bodies.length === 0) {
    throw new RangeError(
      'createBodyLabels: parameter "bodies" must contain at least one body, got 0',
    );
  }

  const count = bodies.length;
  const frameIndex = new Int16Array(count);
  for (let index = 0; index < count; index += 1) {
    const id = bodies[index]?.id ?? '';
    const slot = findFrameId(frame, id);
    if (slot < 0) {
      throw new RangeError(
        `createBodyLabels: parameter "frame" must contain every body id, got missing "${id}"`,
      );
    }
    frameIndex[index] = slot;
  }

  const names: string[] = [];
  for (let index = 0; index < count; index += 1) {
    names.push(i18n.t(`bodies.${bodies[index]?.id ?? ''}.name`));
  }

  const element = document.createElement('div');
  element.id = 'body-labels';
  element.setAttribute('aria-hidden', 'true');

  // Leader lines live in the DOM, not in the scene: no draw calls. One line
  // per body, made once.
  const leaders = document.createElementNS(SVG_NS, 'svg');
  leaders.id = 'label-leaders';
  leaders.setAttribute('aria-hidden', 'true');
  element.append(leaders);

  const ids: string[] = [];
  const parentIds: (string | null)[] = [];
  const moons = new Uint8Array(count);
  const elements: HTMLElement[] = [];
  const lines: SVGLineElement[] = [];
  for (let index = 0; index < count; index += 1) {
    const body = bodies[index];
    const id = body?.id ?? '';
    ids.push(id);
    parentIds.push(body?.parentId ?? null);
    moons[index] = isMoon(body) ? 1 : 0;
    const label = document.createElement('span');
    label.className = 'body-label is-hidden';
    label.dataset['testid'] = `body-label-${id}`;
    label.dataset['bodyId'] = id;
    if (moons[index] === 1) {
      label.classList.add('is-moon');
    } else {
      const dot = document.createElement('span');
      dot.className = 'body-label__dot';
      dot.style.background = body?.color ?? '#ffffff';
      label.append(dot);
    }
    label.append(names[index] ?? '');
    element.append(label);
    elements.push(label);
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('visibility', 'hidden');
    leaders.append(line);
    lines.push(line);
  }

  if (options.before === undefined) {
    parent.append(element);
  } else {
    parent.insertBefore(element, options.before);
  }

  const measure = options.measure ?? defaultMeasure;
  const labelWidth = new Float64Array(count);
  const labelHeight = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    labelHeight[index] =
      moons[index] === 1
        ? VIEW_CONFIG.moonLabelHeightPx
        : VIEW_CONFIG.labelHeightPx;
  }
  const parentIndex = new Int16Array(count);
  for (let index = 0; index < count; index += 1) {
    parentIndex[index] = findBody(ids, parentIds[index] ?? null);
  }

  const order = new Uint16Array(count);
  const x = new Float64Array(count);
  const y = new Float64Array(count);
  const radiusPx = new Float64Array(count);
  const visible = new Uint8Array(count);
  const shown = new Uint8Array(count);
  const outX = new Float64Array(count);
  const outY = new Float64Array(count);
  const side = new Uint8Array(count);
  const radiiKm = new Float64Array(count);
  const lastHidden = new Uint8Array(count);
  const lastLeft = new Float64Array(count);
  const lastTop = new Float64Array(count);
  const written = new Uint8Array(count);
  const origin = new Float64Array(2);
  const leader = new Float64Array(4);
  // x1, y1, x2, y2 per line as last written; NaN = hidden.
  const lastLeader = new Float64Array(count * 4).fill(Number.NaN);
  for (let index = 0; index < count; index += 1) {
    radiiKm[index] = bodies[index]?.radiusKm ?? 0;
    lastHidden[index] = 1;
  }

  const layout: LabelLayout = {
    count,
    order,
    x,
    y,
    radiusPx,
    visible,
    labelWidth,
    labelHeight,
    selectedIndex: -1,
    sunIndex: findBody(ids, 'sun'),
    parentIndex,
    shown,
    outX,
    outY,
    side,
    width: 1,
    height: 1,
  };

  let disposed = false;
  let viewWidth = 0;
  let viewHeight = 0;
  let layoutSeconds = 0;
  let pendingLayout = false;
  let selectedId = selection.getSelectedId();
  let selectedIndex = findBody(ids, selectedId);
  let hoveredIndex = findBody(ids, selection.getHoveredId());

  applySelected(selectedId);
  applyHover(hoveredIndex);
  measureAll();

  const unsubscribe = selection.subscribe(onSelection);
  element.addEventListener('click', onClick);

  return { element, update, dispose };

  function update(
    widthCss: number,
    heightCss: number,
    dtSeconds: number,
  ): void {
    if (disposed || !(widthCss > 0) || !(heightCss > 0)) {
      return;
    }

    viewWidth = widthCss;
    viewHeight = heightCss;
    const step = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 0;
    let run = pendingLayout;
    pendingLayout = false;
    layoutSeconds += step;
    if (layoutSeconds >= LAYOUT_INTERVAL_SECONDS) {
      layoutSeconds -= LAYOUT_INTERVAL_SECONDS;
      run = true;
    }
    if (run) {
      runLayout();
    }
    // Position tracks the frame every call. Collision, visibility, and
    // copy stay on the 10 Hz accumulator above.
    writeTransforms();
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    unsubscribe();
    element.removeEventListener('click', onClick);
    element.remove();
  }

  function onSelection(event: SelectionEvent): void {
    if (disposed) {
      return;
    }
    if (event.kind === 'hover') {
      applyHover(findBody(ids, event.id));
      return;
    }
    if (event.kind === 'selected') {
      selectedId = event.id;
    } else {
      selectedId = null;
    }
    selectedIndex = findBody(ids, selectedId);
    applySelected(selectedId);
    // The selected label is 14 px, so its width changes with the selection.
    measureAll();
    layoutImmediately();
  }

  function onClick(event: MouseEvent): void {
    if (disposed) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const label = target.closest('[data-body-id]');
    if (label === null || !element.contains(label)) {
      return;
    }
    const id = label.getAttribute('data-body-id');
    if (id === null || id.length === 0) {
      return;
    }
    // Moons are not selectable (outside M4).
    if (moons[findBody(ids, id)] === 1) {
      return;
    }
    selection.select(id);
  }

  function layoutImmediately(): void {
    if (!(viewWidth > 0) || !(viewHeight > 0)) {
      pendingLayout = true;
      return;
    }
    runLayout();
    writeTransforms();
  }

  function runLayout(): void {
    for (let index = 0; index < count; index += 1) {
      const slot = frameIndex[index] ?? 0;
      x[index] = frame.x[slot] ?? 0;
      y[index] = frame.y[slot] ?? 0;
      radiusPx[index] = frame.radiusPx[slot] ?? 0;
      visible[index] = frame.visible[slot] ?? 0;
    }
    // A moon behind its planet's disc is hidden and gets no label.
    for (let index = 0; index < count; index += 1) {
      const parent = parentIndex[index] ?? -1;
      if (moons[index] !== 1 || parent < 0 || visible[index] === 0) {
        continue;
      }
      const slot = frameIndex[index] ?? 0;
      const parentSlot = frameIndex[parent] ?? 0;
      const dx = (x[index] ?? 0) - (x[parent] ?? 0);
      const dy = (y[index] ?? 0) - (y[parent] ?? 0);
      const radius = radiusPx[parent] ?? 0;
      if (
        (visible[parent] ?? 0) === 1 &&
        dx * dx + dy * dy < radius * radius &&
        (frame.depth[slot] ?? 0) > (frame.depth[parentSlot] ?? 0)
      ) {
        visible[index] = 0;
      }
    }
    layout.selectedIndex = selectedIndex;
    layout.width = viewWidth;
    layout.height = viewHeight;
    computeLabelOrder(order, ids, radiiKm, selectedId, parentIds);
    layoutLabels(layout);
    for (let index = 0; index < count; index += 1) {
      writeHidden(index, (shown[index] ?? 0) === 0 ? 1 : 0);
    }
  }

  function writeHidden(index: number, hidden: number): void {
    if (lastHidden[index] === hidden) {
      return;
    }
    lastHidden[index] = hidden;
    const label = elements[index];
    if (label === undefined) {
      return;
    }
    if (hidden === 1) {
      label.classList.add('is-hidden');
    } else {
      label.classList.remove('is-hidden');
    }
  }

  /**
   * Between layouts a label follows its body and can slide onto another
   * disc (fast time). Such a label hides until the next layout. Pinned
   * labels (selected, Sun) stay, as in the layout.
   */
  function crossesOtherDisc(index: number, left: number, top: number): boolean {
    if (index === selectedIndex || index === layout.sunIndex) {
      return false;
    }
    const width = labelWidth[index] ?? 0;
    const height = labelHeight[index] ?? 0;
    const parent = moons[index] === 1 ? (parentIndex[index] ?? -1) : -1;
    for (let other = 0; other < count; other += 1) {
      const slot = frameIndex[other] ?? 0;
      // A moon's label may cross its planet's disc (as in the layout).
      if (
        other === index ||
        other === parent ||
        (frame.visible[slot] ?? 0) === 0
      ) {
        continue;
      }
      if (
        rectHitsDisc(
          left,
          top,
          width,
          height,
          frame.x[slot] ?? 0,
          frame.y[slot] ?? 0,
          frame.radiusPx[slot] ?? 0,
          0,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  function writeTransforms(): void {
    for (let index = 0; index < count; index += 1) {
      const slot = frameIndex[index] ?? 0;
      labelCandidateOrigin(
        origin,
        side[index] ?? 0,
        frame.x[slot] ?? 0,
        frame.y[slot] ?? 0,
        frame.radiusPx[slot] ?? 0,
        labelWidth[index] ?? 0,
        labelHeight[index] ?? 0,
        viewWidth,
        viewHeight,
      );
      const left = roundTenth(origin[0] ?? 0);
      const top = roundTenth(origin[1] ?? 0);
      if (!Number.isFinite(left) || !Number.isFinite(top)) {
        continue;
      }
      if ((shown[index] ?? 0) === 1 && crossesOtherDisc(index, left, top)) {
        shown[index] = 0;
        writeHidden(index, 1);
      }
      if (
        written[index] === 1 &&
        left === lastLeft[index] &&
        top === lastTop[index]
      ) {
        continue;
      }
      const label = elements[index];
      if (label === undefined) {
        continue;
      }
      label.style.transform = `translate(${left}px, ${top}px)`;
      lastLeft[index] = left;
      lastTop[index] = top;
      written[index] = 1;
    }
    writeLeaders();
  }

  // A line for labels beside their body; it follows the label every frame.
  function writeLeaders(): void {
    for (let index = 0; index < count; index += 1) {
      const line = lines[index];
      if (line === undefined) {
        continue;
      }
      const slot = frameIndex[index] ?? 0;
      const base = index * 4;
      const radius = frame.radiusPx[slot] ?? 0;
      const drawn =
        (shown[index] ?? 0) === 1 &&
        (side[index] ?? 0) >= LABEL_SIDE_RIGHT &&
        written[index] === 1 &&
        Number.isFinite(radius) &&
        radius >= 0;
      if (!drawn) {
        if (!Number.isNaN(lastLeader[base] ?? Number.NaN)) {
          line.setAttribute('visibility', 'hidden');
          lastLeader[base] = Number.NaN;
        }
        continue;
      }
      leaderLine(
        leader,
        side[index] ?? 0,
        frame.x[slot] ?? 0,
        frame.y[slot] ?? 0,
        radius,
        lastLeft[index] ?? 0,
        lastTop[index] ?? 0,
        labelWidth[index] ?? 0,
        labelHeight[index] ?? 0,
      );
      if (Number.isNaN(lastLeader[base] ?? Number.NaN)) {
        line.setAttribute('visibility', 'visible');
      }
      writeCoordinate(line, 'x1', base, roundTenth(leader[0] ?? 0));
      writeCoordinate(line, 'y1', base + 1, roundTenth(leader[1] ?? 0));
      writeCoordinate(line, 'x2', base + 2, roundTenth(leader[2] ?? 0));
      writeCoordinate(line, 'y2', base + 3, roundTenth(leader[3] ?? 0));
    }
  }

  function writeCoordinate(
    line: SVGLineElement,
    name: 'x1' | 'y1' | 'x2' | 'y2',
    slot: number,
    value: number,
  ): void {
    if (lastLeader[slot] === value) {
      return;
    }
    lastLeader[slot] = value;
    line.setAttribute(name, String(value));
  }

  function measureAll(): void {
    for (let index = 0; index < count; index += 1) {
      const label = elements[index];
      labelWidth[index] = label === undefined ? 0 : measure(label);
    }
  }

  function applySelected(id: string | null): void {
    for (let index = 0; index < count; index += 1) {
      const label = elements[index];
      if (label === undefined) {
        continue;
      }
      if (id !== null && ids[index] === id) {
        label.classList.add('is-selected');
      } else {
        label.classList.remove('is-selected');
      }
    }
  }

  function applyHover(index: number): void {
    if (hoveredIndex >= 0 && hoveredIndex !== index) {
      elements[hoveredIndex]?.classList.remove('is-hovered');
    }
    hoveredIndex = index;
    if (hoveredIndex >= 0) {
      elements[hoveredIndex]?.classList.add('is-hovered');
    }
  }
}

function defaultMeasure(element: HTMLElement): number {
  return element.offsetWidth;
}

function findFrameId(frame: BodyScreenFrame, id: string): number {
  for (let index = 0; index < frame.count; index += 1) {
    if (frame.ids[index] === id) {
      return index;
    }
  }
  return -1;
}

function findBody(ids: readonly string[], id: string | null): number {
  if (id === null) {
    return -1;
  }
  for (let index = 0; index < ids.length; index += 1) {
    if (ids[index] === id) {
      return index;
    }
  }
  return -1;
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
