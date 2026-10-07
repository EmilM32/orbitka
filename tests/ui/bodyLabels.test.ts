// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { expect, test, vi } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import {
  createBodyScreenFrame,
  type BodyScreenFrame,
} from '@core/bodyScreenFrame.ts';
import { getSelectableBodies } from '@core/selectableBodies.ts';
import { type SelectableBody } from '@core/selectableBodies.ts';
import { createSelection, type Selection } from '@core/selection.ts';
import { VIEW_CONFIG } from '@core/viewConfig.ts';
import { bodies as catalog } from '@data/bodies.ts';
import { createBodyLabels, type BodyLabels } from '@ui/bodyLabels.ts';
import { createI18n, type Dictionary, type I18n } from '@ui/i18n.ts';

const i18n = createI18n(pl, 'pl-PL');
const CSS = readFileSync('src/ui/bodyLabels.css', 'utf8');
const SOURCE = readFileSync('src/ui/bodyLabels.ts', 'utf8');

const LABEL_HEIGHT = VIEW_CONFIG.labelHeightPx;

test('one label per body', () => {
  reset();
  const bodies = getSelectableBodies(catalog);
  const { labels } = mount(bodies);
  const nodes = labels.element.querySelectorAll('.body-label');
  expect(nodes).toHaveLength(9);
  expect(text('earth')).toBe('Ziemia');
  expect(text('sun')).toBe('Słońce');
  for (const body of bodies) {
    const label = labelFor(body.id);
    expect(label.dataset['testid']).toBe(`body-label-${body.id}`);
    expect(label.textContent).toBe(
      pl[`bodies.${body.id}.name` as keyof typeof pl],
    );
    expect(label.tagName).toBe('SPAN');
  }

  labels.dispose();
  const few = [
    { id: 'sun', type: 'star', radiusKm: 100 },
    { id: 'earth', type: 'planet', radiusKm: 10 },
    { id: 'mars', type: 'planet', radiusKm: 5 },
  ] as const satisfies readonly SelectableBody[];
  const short = mount([...few]);
  expect(short.labels.element.querySelectorAll('.body-label')).toHaveLength(3);
  short.labels.dispose();
  short.selection.dispose();
});

test('css contract', () => {
  expect(CSS).toContain('font-size: 13px');
  expect(CSS).toContain('#ffffff');
  expect(CSS).toContain('rgba(10, 14, 30, 0.85)');
  expect(CSS).toContain('font-weight: 700');
  expect(CSS).toContain('z-index: var(--layer-overlay)');
  expect(CSS).not.toMatch(/transition/iu);
  expect(CSS).not.toMatch(/animation/iu);
  expect(CSS).toMatch(/#body-labels\s*\{[^}]*pointer-events:\s*none/u);
  expect(CSS).toMatch(
    /@media \(pointer: fine\)\s*\{[^}]*pointer-events:\s*auto/u,
  );
  expect(CSS).toMatch(
    /@media \(pointer: coarse\)\s*\{[^}]*pointer-events:\s*none/u,
  );
  expect(CSS).not.toMatch(/::after/u);
});

test('contrast at least 4.5', () => {
  const panelOnWhite = composite([10, 14, 30], 0.85, [255, 255, 255]);
  const panelOnSun = composite([10, 14, 30], 0.85, [253, 184, 19]);
  expect(contrast([255, 255, 255], panelOnWhite)).toBeGreaterThanOrEqual(4.5);
  expect(contrast([255, 255, 255], panelOnSun)).toBeGreaterThanOrEqual(4.5);
  expect(contrast([10, 14, 30], [255, 213, 74])).toBeGreaterThanOrEqual(4.5);
});

test('position follows frame', () => {
  reset();
  const { labels, frame, selection } = mount(one('earth'), {
    measure: () => 40,
  });
  place(frame, 'earth', 200, 120, 10);
  labels.update(800, 600, 0);
  expect(labelFor('earth').style.transform).toBe(
    expectedTransform(200, 120, 10, 40),
  );
  expect(labelFor('earth').style.transform).not.toContain('NaN');

  labels.update(800, 600, 0.1);
  expect(labelFor('earth').style.transform).not.toContain('NaN');

  const transforms = countSetter(
    Object.getPrototypeOf(labelFor('earth').style) as object,
    'transform',
  );
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
  const offset = vi
    .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
    .mockReturnValue(40);
  try {
    place(frame, 'earth', 200.04, 120, 10);
    labels.update(800, 600, 0);
    expect(transforms.read()).toBe(0);
    expect(labelFor('earth').style.transform).toBe(
      expectedTransform(200, 120, 10, 40),
    );

    place(frame, 'earth', 200.1, 120, 10);
    labels.update(800, 600, 0);
    expect(transforms.read()).toBe(1);
    expect(labelFor('earth').style.transform).toBe(
      expectedTransform(200.1, 120, 10, 40),
    );
    expect(rect).not.toHaveBeenCalled();
    expect(offset).not.toHaveBeenCalled();
  } finally {
    transforms.restore();
    rect.mockRestore();
    offset.mockRestore();
  }

  place(frame, 'earth', 90, 40, 4);
  labels.update(100, 80, 0.1);
  const clamped = labelFor('earth').style.transform;
  expect(clamped.startsWith('translate(')).toBe(true);
  const match = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/u.exec(clamped);
  expect(match).not.toBeNull();
  const left = Number(match?.[1]);
  const top = Number(match?.[2]);
  expect(left).toBeGreaterThanOrEqual(0);
  expect(top).toBeGreaterThanOrEqual(0);
  expect(left + 40).toBeLessThanOrEqual(100);
  expect(top + LABEL_HEIGHT).toBeLessThanOrEqual(80);

  const fresh = mount(one('mars'), { measure: () => 30 });
  fresh.labels.update(0, 0, 0.1);
  fresh.labels.update(0, 0, 0);
  expect(labelFor('mars').style.transform).not.toContain('NaN');
  fresh.labels.dispose();
  fresh.selection.dispose();

  labels.dispose();
  selection.dispose();
});

test('hidden labels get hidden state', () => {
  reset();
  const bodies = [body('jupiter', 69911), body('mars', 3389.5)];
  const { labels, frame, selection } = mount(bodies, { measure: () => 80 });
  place(frame, 'jupiter', 200, 200, 12);
  place(frame, 'mars', 200, 200, 8);
  labels.update(800, 600, 0.1);
  expect(labelFor('jupiter').classList.contains('is-hidden')).toBe(false);
  expect(labelFor('mars').classList.contains('is-hidden')).toBe(true);
  expect(CSS).toMatch(/\.is-hidden\s*\{[^}]*visibility:\s*hidden/u);
  labels.dispose();
  selection.dispose();
});

test('label sliding onto another disc hides until the next layout', () => {
  reset();
  const bodies = [
    body('sun', 695700),
    body('earth', 6371),
    body('mars', 3389.5),
  ];
  const { labels, frame, selection } = mount(bodies, { measure: () => 50 });
  place(frame, 'sun', 400, 300, 40);
  place(frame, 'earth', 400, 150, 6);
  place(frame, 'mars', 700, 150, 4);
  labels.update(800, 600, 0.1);
  expect(labelFor('earth').classList.contains('is-hidden')).toBe(false);
  expect(labelFor('mars').classList.contains('is-hidden')).toBe(false);

  // Fast time: before the next layout Earth's label reaches the Sun's disc.
  place(frame, 'earth', 400, 360, 6);
  labels.update(800, 600, 1 / 60);
  expect(labelFor('earth').classList.contains('is-hidden')).toBe(true);
  // A label clear of every disc stays as it was.
  expect(labelFor('mars').classList.contains('is-hidden')).toBe(false);
  // The Sun's own label is pinned and is not hidden by this check.
  expect(labelFor('sun').classList.contains('is-hidden')).toBe(false);

  // Back clear of the disc: still hidden until the layout runs again.
  place(frame, 'earth', 400, 150, 6);
  labels.update(800, 600, 1 / 60);
  expect(labelFor('earth').classList.contains('is-hidden')).toBe(true);
  labels.update(800, 600, 0.1);
  expect(labelFor('earth').classList.contains('is-hidden')).toBe(false);

  // A selected label is pinned too and never hidden by this check.
  selection.select('mars');
  place(frame, 'mars', 400, 360, 4);
  labels.update(800, 600, 1 / 60);
  expect(labelFor('mars').classList.contains('is-hidden')).toBe(false);

  labels.dispose();
  selection.dispose();
});

test('layout runs at most ten times per second', () => {
  reset();
  expect(SOURCE.includes('setTimeout')).toBe(false);
  expect(SOURCE.includes('setInterval')).toBe(false);
  expect(SOURCE.includes('requestAnimationFrame')).toBe(false);

  const { labels, frame, selection } = mount(one('earth'), {
    measure: () => 40,
  });
  place(frame, 'earth', 100, 80, 10, 1);

  let hiddenWrites = 0;
  let ariaWrites = 0;
  let textWrites = 0;
  const add = DOMTokenList.prototype.add;
  const remove = DOMTokenList.prototype.remove;
  const setAttribute = Element.prototype.setAttribute;
  const text = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
  const addSpy = vi
    .spyOn(DOMTokenList.prototype, 'add')
    .mockImplementation(function addHidden(
      this: DOMTokenList,
      ...tokens: string[]
    ) {
      if (tokens.includes('is-hidden')) {
        hiddenWrites += 1;
      }
      return add.apply(this, tokens);
    });
  const removeSpy = vi
    .spyOn(DOMTokenList.prototype, 'remove')
    .mockImplementation(function removeHidden(
      this: DOMTokenList,
      ...tokens: string[]
    ) {
      if (tokens.includes('is-hidden')) {
        hiddenWrites += 1;
      }
      return remove.apply(this, tokens);
    });
  const attributeSpy = vi
    .spyOn(Element.prototype, 'setAttribute')
    .mockImplementation(function setAttributeSpy(
      this: Element,
      name: string,
      value: string,
    ) {
      if (name.startsWith('aria')) {
        ariaWrites += 1;
      }
      return setAttribute.call(this, name, value);
    });
  const textSpy =
    text?.set === undefined
      ? null
      : vi
          .spyOn(Node.prototype, 'textContent', 'set')
          .mockImplementation(function setText(
            this: Node,
            value: string | null,
          ) {
            textWrites += 1;
            text.set?.call(this, value);
          });
  const timeout = vi.spyOn(window, 'setTimeout');
  const interval = vi.spyOn(window, 'setInterval');
  const raf = vi.spyOn(window, 'requestAnimationFrame');

  const transforms = countSetter(
    Object.getPrototypeOf(labelFor('earth').style) as object,
    'transform',
  );

  try {
    for (let index = 0; index < 30; index += 1) {
      frame.visible[0] = index % 2 === 0 ? 1 : 0;
      frame.x[0] = 100 + index;
      labels.update(800, 600, 1 / 60);
    }
  } finally {
    addSpy.mockRestore();
    removeSpy.mockRestore();
    attributeSpy.mockRestore();
    textSpy?.mockRestore();
    timeout.mockRestore();
    interval.mockRestore();
    raf.mockRestore();
    const transformWrites = transforms.read();
    transforms.restore();
    expect(hiddenWrites).toBeGreaterThan(0);
    expect(hiddenWrites).toBeLessThanOrEqual(5);
    expect(ariaWrites).toBeLessThanOrEqual(5);
    expect(textWrites).toBeLessThanOrEqual(5);
    expect(transformWrites).toBe(30);
    expect(timeout).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    expect(raf).not.toHaveBeenCalled();
  }

  labels.dispose();
  selection.dispose();

  const overlap = mount([body('jupiter', 69911), body('mars', 3389.5)], {
    measure: () => 90,
  });
  place(overlap.frame, 'jupiter', 300, 240, 16);
  place(overlap.frame, 'mars', 300, 240, 8);
  for (let index = 0; index < 5; index += 1) {
    overlap.labels.update(800, 600, 1 / 60);
  }
  expect(labelFor('mars').classList.contains('is-hidden')).toBe(true);
  overlap.selection.select('mars');
  expect(labelFor('mars').classList.contains('is-hidden')).toBe(false);
  expect(labelFor('mars').classList.contains('is-selected')).toBe(true);
  overlap.selection.select('jupiter');
  expect(labelFor('jupiter').classList.contains('is-selected')).toBe(true);
  expect(labelFor('mars').classList.contains('is-selected')).toBe(false);
  expect(labelFor('mars').classList.contains('is-hidden')).toBe(true);
  overlap.selection.showSystem();
  expect(labelFor('jupiter').classList.contains('is-selected')).toBe(false);
  expect(labelFor('jupiter').classList.contains('is-hidden')).toBe(false);
  overlap.labels.dispose();
  overlap.selection.dispose();
});

test('click selects', () => {
  reset();
  const { labels, selection } = mount(
    [body('earth', 6371), body('mars', 3389.5)],
    { measure: () => 40 },
  );
  labelFor('earth').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(selection.getSelectedId()).toBe('earth');

  let events = 0;
  const unsubscribe = selection.subscribe(() => {
    events += 1;
  });
  labelFor('earth').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(events).toBe(0);
  expect(selection.getSelectedId()).toBe('earth');
  expect(SOURCE.includes('focusBody')).toBe(false);
  unsubscribe();
  labels.dispose();
  selection.dispose();
});

test('selected bold and hovered class', () => {
  reset();
  const { labels, selection } = mount(
    [body('earth', 6371), body('mars', 3389.5)],
    { measure: () => 40 },
  );
  selection.select('earth');
  expect(labelFor('earth').classList.contains('is-selected')).toBe(true);
  expect(labelFor('mars').classList.contains('is-selected')).toBe(false);
  selection.setHovered('mars');
  expect(labelFor('mars').classList.contains('is-hovered')).toBe(true);
  expect(labelFor('earth').classList.contains('is-hovered')).toBe(false);
  selection.setHovered(null);
  expect(labelFor('mars').classList.contains('is-hovered')).toBe(false);
  selection.showSystem();
  expect(labelFor('earth').classList.contains('is-selected')).toBe(false);
  labels.dispose();
  selection.dispose();
});

test('hidden from assistive tech', () => {
  reset();
  const { labels, selection } = mount(getSelectableBodies(catalog));
  expect(labels.element.getAttribute('aria-hidden')).toBe('true');
  for (const label of labels.element.querySelectorAll('.body-label')) {
    expect(label.hasAttribute('tabindex')).toBe(false);
    expect(label.tagName).toBe('SPAN');
  }
  labels.dispose();
  selection.dispose();
});

test('coarse pointer labels ignore pointer events', () => {
  expect(CSS).toMatch(
    /@media \(pointer: coarse\)\s*\{[^}]*pointer-events:\s*none/u,
  );
  expect(CSS).not.toMatch(/::after/u);
  const fine = /@media \(pointer: fine\)\s*\{([\s\S]*?)\n\}/u.exec(CSS);
  expect(fine).not.toBeNull();
  expect(fine?.[1]).toMatch(/\.body-label\s*\{[^}]*pointer-events:\s*auto/u);
  // The click target grows past the drawn label with a pseudo-element.
  const target = /\.body-label::before\s*\{([^}]*)\}/u.exec(fine?.[1] ?? '');
  expect(target).not.toBeNull();
  const inset = /inset:\s*-(\d+)px 0/u.exec(target?.[1] ?? '');
  expect(
    VIEW_CONFIG.labelHeightPx + 2 * Number(inset?.[1]),
  ).toBeGreaterThanOrEqual(32);
});

test('drawn label height is the layout height', () => {
  const rule = /\.body-label\s*\{([^}]*)\}/u.exec(CSS);
  expect(rule).not.toBeNull();
  const body = rule?.[1] ?? '';
  expect(body).toMatch(
    new RegExp(`\\bheight:\\s*${VIEW_CONFIG.labelHeightPx}px`, 'u'),
  );
  expect(body).toMatch(/box-sizing:\s*border-box/u);
  expect(body).not.toMatch(/min-height/u);
  expect(CSS).not.toMatch(/min-height/u);
  // The text box fits inside: line height plus vertical padding.
  const lineHeight = /line-height:\s*(\d+)px/u.exec(body);
  const padding = /padding:\s*(\d+)px/u.exec(body);
  expect(Number(lineHeight?.[1]) + 2 * Number(padding?.[1])).toBe(
    VIEW_CONFIG.labelHeightPx,
  );
  expect(Number(lineHeight?.[1])).toBeGreaterThanOrEqual(
    VIEW_CONFIG.labelFontPx * 1.2,
  );
});

test('missing body id and empty list', () => {
  reset();
  const selection = createSelection(['mars', 'earth']);
  const frame = createBodyScreenFrame(['earth']);
  expect(() =>
    createBodyLabels(document.body, {
      bodies: [body('mars', 1), body('earth', 2)],
      selection,
      i18n,
      frame,
      measure: () => 10,
    }),
  ).toThrow(
    'createBodyLabels: parameter "frame" must contain every body id, got missing "mars"',
  );
  expect(document.querySelector('#body-labels')).toBeNull();

  expect(() =>
    createBodyLabels(document.body, {
      bodies: [],
      selection,
      i18n,
      frame: createBodyScreenFrame([]),
    }),
  ).toThrow(
    'createBodyLabels: parameter "bodies" must contain at least one body, got 0',
  );

  const dictionary: Record<string, unknown> = { ...pl };
  delete dictionary['bodies.mars.name'];
  const partial = createI18n(dictionary as Dictionary, 'pl-PL');
  expect(() =>
    createBodyLabels(document.body, {
      bodies: [body('mars', 1)],
      selection: createSelection(['mars']),
      i18n: partial as I18n<Dictionary>,
      frame: createBodyScreenFrame(['mars']),
    }),
  ).toThrow('i18n: missing key "bodies.mars.name"');
  expect(document.querySelector('#body-labels')).toBeNull();
  selection.dispose();
});

test('dispose cleans up', () => {
  reset();
  const selection = createSelection(['earth']);
  let unsubscribed = false;
  const labels = createBodyLabels(document.body, {
    bodies: [body('earth', 6371)],
    selection: {
      select: (id) => selection.select(id),
      showSystem: () => selection.showSystem(),
      setHovered: (id) => selection.setHovered(id),
      getSelectedId: () => selection.getSelectedId(),
      getHoveredId: () => selection.getHoveredId(),
      ids: selection.ids,
      subscribe: (listener) => {
        const unsubscribe = selection.subscribe(listener);
        return () => {
          unsubscribed = true;
          unsubscribe();
        };
      },
      dispose: () => selection.dispose(),
    },
    i18n,
    frame: createBodyScreenFrame(['earth']),
    measure: () => 20,
  });
  const label = labelFor('earth');
  labels.dispose();
  expect(unsubscribed).toBe(true);
  expect(labels.element.isConnected).toBe(false);
  label.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(selection.getSelectedId()).toBeNull();
  expect(() => labels.dispose()).not.toThrow();
  expect(() => labels.update(100, 100, 0.1)).not.toThrow();
  selection.dispose();
});

test('update does not allocate', () => {
  reset();
  const { labels, frame, selection } = mount(one('earth'), {
    measure: () => 40,
  });
  place(frame, 'earth', 120, 80, 10, 1);
  labels.update(800, 600, 0.2);

  const push = vi.spyOn(Array.prototype, 'push');
  const splice = vi.spyOn(Array.prototype, 'splice');
  const mapSet = vi.spyOn(Map.prototype, 'set');
  push.mockClear();
  splice.mockClear();
  mapSet.mockClear();
  try {
    for (let index = 0; index < 1000; index += 1) {
      labels.update(800, 600, 1 / 60);
    }
  } finally {
    const pushCalls = push.mock.calls.length;
    const spliceCalls = splice.mock.calls.length;
    const mapSetCalls = mapSet.mock.calls.length;
    push.mockRestore();
    splice.mockRestore();
    mapSet.mockRestore();
    expect(pushCalls).toBe(0);
    expect(spliceCalls).toBe(0);
    expect(mapSetCalls).toBe(0);
  }

  labels.dispose();
  selection.dispose();
});

function reset(): void {
  document.body.replaceChildren();
}

function body(id: string, radiusKm: number): SelectableBody {
  return {
    id,
    type: id === 'sun' ? 'star' : 'planet',
    radiusKm,
  };
}

function one(id: string): SelectableBody[] {
  return [body(id, 6371)];
}

function mount(
  bodies: readonly SelectableBody[],
  options: { measure?: (element: HTMLElement) => number } = {},
): { labels: BodyLabels; selection: Selection; frame: BodyScreenFrame } {
  const selection = createSelection(bodies.map((item) => item.id));
  const frame = createBodyScreenFrame(bodies.map((item) => item.id));
  const labels = createBodyLabels(document.body, {
    bodies,
    selection,
    i18n,
    frame,
    measure: options.measure ?? (() => 48),
  });
  return { labels, selection, frame };
}

function place(
  frame: BodyScreenFrame,
  id: string,
  x: number,
  y: number,
  radiusPx: number,
  visible = 1,
): void {
  const index = frame.ids.indexOf(id);
  frame.x[index] = x;
  frame.y[index] = y;
  frame.radiusPx[index] = radiusPx;
  frame.visible[index] = visible;
  frame.depth[index] = 10;
}

function labelFor(id: string): HTMLElement {
  const label = document.querySelector(`[data-testid="body-label-${id}"]`);
  if (!(label instanceof HTMLElement)) {
    throw new Error(`missing label ${id}`);
  }
  return label;
}

function text(id: string): string {
  return labelFor(id).textContent ?? '';
}

function expectedTransform(
  x: number,
  y: number,
  radiusPx: number,
  width: number,
): string {
  const left = roundTenth(x - width / 2);
  const top = roundTenth(y - radiusPx - 6 - LABEL_HEIGHT);
  return `translate(${left}px, ${top}px)`;
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function countSetter(
  prototype: object,
  property: string,
): { read(): number; restore(): void } {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
  const set = descriptor?.set;
  if (descriptor === undefined || set === undefined) {
    throw new Error(`missing setter: ${property}`);
  }
  let count = 0;
  Object.defineProperty(prototype, property, {
    configurable: true,
    enumerable: descriptor.enumerable,
    get: descriptor.get,
    set(this: unknown, value: unknown) {
      count += 1;
      set.call(this, value);
    },
  });
  return {
    read: () => count,
    restore() {
      Object.defineProperty(prototype, property, descriptor);
    },
  };
}

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
