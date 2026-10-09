// @vitest-environment jsdom

import { expect, test, vi } from 'vitest';

import { createBodyScreenFrame } from '@core/bodyScreenFrame.ts';
import { createSelection, type Selection } from '@core/selection.ts';
import { createSelectionRing } from '@ui/selectionRing.ts';

const IDS = ['sun', 'earth', 'mars'];

function placeEarth(
  frame: ReturnType<typeof createBodyScreenFrame>,
  x: number,
  y: number,
  radiusPx: number,
  visible = 1,
): void {
  frame.x[1] = x;
  frame.y[1] = y;
  frame.depth[1] = 10;
  frame.radiusPx[1] = radiusPx;
  frame.outlineRadiusPx[1] = radiusPx;
  frame.visible[1] = visible;
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

function mount(): {
  selection: Selection;
  frame: ReturnType<typeof createBodyScreenFrame>;
  ring: ReturnType<typeof createSelectionRing>;
} {
  const selection = createSelection(IDS);
  const frame = createBodyScreenFrame(IDS);
  const ring = createSelectionRing(document.body, { selection, frame });
  return { selection, frame, ring };
}

test('ring geometry', () => {
  const { selection, frame, ring } = mount();
  const element = ring.element;

  expect(element.id).toBe('selection-ring');
  // SPEC §5.5: a 1.5 px yellow outline at 75 %, no crosshair.
  expect(element.style.border).toBe('1.5px solid rgba(255, 194, 75, 0.75)');
  expect(element.children).toHaveLength(0);
  expect(element.style.pointerEvents).toBe('none');
  expect(element.getAttribute('aria-hidden')).toBe('true');
  expect(element.style.position).toBe('fixed');
  expect(element.hidden).toBe(true);

  placeEarth(frame, 100, 50, 20);
  selection.select('earth');
  ring.update(0.1);
  expect(element.hidden).toBe(false);
  // Disc radius + 8 px (SPEC §5.5).
  expect(element.style.width).toBe('56px');
  expect(element.style.height).toBe('56px');
  expect(element.style.transform).toBe('translate(72px, 22px)');

  placeEarth(frame, 40, 40, 1);
  ring.update(0.1);
  expect(element.style.width).toBe('24px');
  expect(element.style.height).toBe('24px');
  expect(element.style.transform).toBe('translate(28px, 28px)');

  frame.visible[1] = 0;
  ring.update(0.1);
  expect(element.hidden).toBe(true);
  expect(element.getAttribute('aria-hidden')).toBe('true');

  frame.visible[1] = 1;
  selection.showSystem();
  ring.update(0.1);
  expect(element.hidden).toBe(true);

  ring.dispose();
  selection.dispose();
});

test('style written only on change of 0.1 px', () => {
  const { selection, frame, ring } = mount();
  placeEarth(frame, 100, 80, 10);
  selection.select('earth');
  ring.update(0.1);

  const transforms = countSetter(
    Object.getPrototypeOf(ring.element.style) as object,
    'transform',
  );

  try {
    frame.x[1] = 100.04;
    ring.update(0.1);
    expect(transforms.read()).toBe(0);
    expect(ring.element.style.transform).toBe('translate(82px, 62px)');

    frame.x[1] = 100.1;
    ring.update(0.1);
    expect(transforms.read()).toBe(1);
    expect(ring.element.style.transform).toBe('translate(82.1px, 62px)');
  } finally {
    transforms.restore();
  }

  ring.dispose();
  selection.dispose();
});

test('visibility and aria refresh at most ten times per second', () => {
  const { selection, frame, ring } = mount();
  placeEarth(frame, 100, 80, 10);
  selection.select('earth');

  const transforms = countSetter(
    Object.getPrototypeOf(ring.element.style) as object,
    'transform',
  );
  const hidden = countSetter(HTMLElement.prototype, 'hidden');
  const setAttribute = Element.prototype.setAttribute;
  let ariaWrites = 0;
  const attributeSpy = vi
    .spyOn(Element.prototype, 'setAttribute')
    .mockImplementation(function setAttributeSpy(
      this: Element,
      name: string,
      value: string,
    ) {
      if (name === 'aria-hidden') {
        ariaWrites += 1;
      }
      return setAttribute.call(this, name, value);
    });

  try {
    for (let index = 0; index < 30; index += 1) {
      frame.visible[1] = index % 2 === 0 ? 1 : 0;
      frame.x[1] = 100 + index;
      ring.update(1 / 60);
    }
  } finally {
    transforms.restore();
    hidden.restore();
    attributeSpy.mockRestore();
  }

  expect(hidden.read()).toBeGreaterThan(0);
  expect(hidden.read()).toBeLessThanOrEqual(5);
  expect(ariaWrites).toBeGreaterThan(0);
  expect(ariaWrites).toBeLessThanOrEqual(5);
  expect(transforms.read()).toBe(30);

  ring.dispose();
  selection.dispose();
});

test('no raf and no layout reads', () => {
  const { selection, frame, ring } = mount();
  placeEarth(frame, 80, 60, 16);
  selection.select('earth');

  const raf = vi.spyOn(window, 'requestAnimationFrame');
  const interval = vi.spyOn(window, 'setInterval');
  const timeout = vi.spyOn(window, 'setTimeout');
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
  const offset = vi
    .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
    .mockReturnValue(0);

  try {
    ring.update(0.1);
    ring.update(1 / 60);
  } finally {
    expect(raf).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
    expect(rect).not.toHaveBeenCalled();
    expect(offset).not.toHaveBeenCalled();
    raf.mockRestore();
    interval.mockRestore();
    timeout.mockRestore();
    rect.mockRestore();
    offset.mockRestore();
  }

  ring.dispose();
  selection.dispose();
});

test('dispose removes element and subscription', () => {
  const selection = createSelection(IDS);
  const frame = createBodyScreenFrame(IDS);
  let unsubscribed = false;
  const ring = createSelectionRing(document.body, {
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
    frame,
  });
  placeEarth(frame, 100, 50, 20);
  selection.select('earth');
  ring.update(0.1);
  expect(document.body.contains(ring.element)).toBe(true);

  ring.dispose();
  expect(unsubscribed).toBe(true);
  expect(document.body.contains(ring.element)).toBe(false);
  selection.select('mars');
  expect(() => ring.update(0.1)).not.toThrow();
  expect(document.body.contains(ring.element)).toBe(false);
  expect(() => ring.dispose()).not.toThrow();
  selection.dispose();
});

test('update does not allocate', () => {
  const { selection, frame, ring } = mount();
  placeEarth(frame, 100, 80, 10, 1);
  selection.select('earth');
  ring.update(0.2);

  const push = vi.spyOn(Array.prototype, 'push');
  const splice = vi.spyOn(Array.prototype, 'splice');
  const mapSet = vi.spyOn(Map.prototype, 'set');
  push.mockClear();
  splice.mockClear();
  mapSet.mockClear();

  try {
    for (let index = 0; index < 1000; index += 1) {
      ring.update(1 / 60);
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

  ring.dispose();
  selection.dispose();
});

test('ring follows the outline radius (Saturn and its rings), not the sphere', () => {
  const { selection, frame, ring } = mount();
  placeEarth(frame, 400, 300, 20);
  frame.outlineRadiusPx[1] = 45;
  selection.select('earth');
  ring.update(0.1);

  // Outline radius + 8 px (SPEC §5.5), not the sphere's 20 px.
  expect(ring.element.style.width).toBe('106px');
  ring.dispose();
  selection.dispose();
});
