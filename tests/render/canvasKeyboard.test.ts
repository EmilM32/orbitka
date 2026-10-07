import { expect, test, vi, type Mock } from 'vitest';

import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import {
  createCanvasKeyboard,
  type CanvasKeyboardController,
  type CanvasKeyboardSurface,
} from '@render/canvasKeyboard.ts';

const ARIA_LABEL =
  'Widok 3D Układu Słonecznego. Strzałki obracają, plus i minus przybliżają.';

class Surface extends EventTarget implements CanvasKeyboardSurface {
  readonly attributes = new Map<string, string>();
  addCount = 0;
  removeCount = 0;
  focusCount = 0;
  blurCount = 0;

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    this.addCount += 1;
    super.addEventListener(type, listener, options);
  }

  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    this.removeCount += 1;
    super.removeEventListener(type, listener, options);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  focus(): void {
    this.focusCount += 1;
  }

  blur(): void {
    this.blurCount += 1;
  }
}

function createController(): CanvasKeyboardController & {
  rotateBy: Mock<
    (
      dAzimuth: number,
      dPolar: number,
      smooth: boolean,
      notify?: boolean,
    ) => void
  >;
  zoomBy: Mock<(factor: number, smooth: boolean, notify?: boolean) => void>;
} {
  return {
    rotateBy: vi.fn(),
    zoomBy: vi.fn(),
  };
}

function press(
  target: EventTarget,
  fields: {
    key: string;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    isComposing?: boolean;
    repeat?: boolean;
  },
): Event {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'key', { value: fields.key });
  Object.defineProperty(event, 'shiftKey', { value: fields.shiftKey ?? false });
  Object.defineProperty(event, 'ctrlKey', { value: fields.ctrlKey ?? false });
  Object.defineProperty(event, 'metaKey', { value: fields.metaKey ?? false });
  Object.defineProperty(event, 'altKey', { value: fields.altKey ?? false });
  Object.defineProperty(event, 'isComposing', {
    value: fields.isComposing ?? false,
  });
  Object.defineProperty(event, 'repeat', { value: fields.repeat ?? false });
  target.dispatchEvent(event);
  return event;
}

test('sets tabindex and aria-label', () => {
  const surface = new Surface();
  createCanvasKeyboard({
    surface,
    controller: createController(),
    onShowSystem: () => undefined,
    ariaLabel: ARIA_LABEL,
  });

  expect(surface.getAttribute('tabindex')).toBe('0');
  expect(surface.getAttribute('aria-label')).toBe(ARIA_LABEL);
  expect(surface.getAttribute('role')).toBeNull();
});

test('arrows rotate by 5 degrees', () => {
  const surface = new Surface();
  const controller = createController();
  createCanvasKeyboard({
    surface,
    controller,
    onShowSystem: () => undefined,
    ariaLabel: ARIA_LABEL,
  });
  const step = (CAMERA_CONFIG.keyRotateStepDeg * Math.PI) / 180;

  press(surface, { key: 'ArrowLeft' });
  press(surface, { key: 'ArrowRight' });
  press(surface, { key: 'ArrowUp' });
  press(surface, { key: 'ArrowDown' });

  expect(CAMERA_CONFIG.keyRotateStepDeg).toBe(5);
  expect(controller.rotateBy.mock.calls).toEqual([
    [-step, 0, false],
    [step, 0, false],
    [0, -step, false],
    [0, step, false],
  ]);
  expect(controller.zoomBy).not.toHaveBeenCalled();
});

test('shift rotates by 15 degrees', () => {
  const surface = new Surface();
  const controller = createController();
  createCanvasKeyboard({
    surface,
    controller,
    onShowSystem: () => undefined,
    ariaLabel: ARIA_LABEL,
  });
  const step = (CAMERA_CONFIG.keyRotateStepShiftDeg * Math.PI) / 180;

  press(surface, { key: 'ArrowLeft', shiftKey: true });
  press(surface, { key: 'ArrowRight', shiftKey: true });
  press(surface, { key: 'ArrowUp', shiftKey: true });
  press(surface, { key: 'ArrowDown', shiftKey: true });

  expect(CAMERA_CONFIG.keyRotateStepShiftDeg).toBe(15);
  expect(controller.rotateBy.mock.calls).toEqual([
    [-step, 0, false],
    [step, 0, false],
    [0, -step, false],
    [0, step, false],
  ]);
});

test('plus minus pageup pagedown zoom ten percent', () => {
  const surface = new Surface();
  const controller = createController();
  createCanvasKeyboard({
    surface,
    controller,
    onShowSystem: () => undefined,
    ariaLabel: ARIA_LABEL,
  });

  press(surface, { key: '+' });
  press(surface, { key: '=' });
  press(surface, { key: 'PageUp' });
  press(surface, { key: '-' });
  press(surface, { key: 'PageDown' });
  press(surface, { key: '+', shiftKey: true });

  expect(CAMERA_CONFIG.zoomStepIn).toBe(0.9);
  expect(CAMERA_CONFIG.zoomStepOut).toBe(1.1);
  expect(controller.zoomBy.mock.calls).toEqual([
    [0.9, false],
    [0.9, false],
    [0.9, false],
    [1.1, false],
    [1.1, false],
    [0.9, false],
  ]);
  expect(controller.rotateBy).not.toHaveBeenCalled();
});

test('home and escape show system', () => {
  const surface = new Surface();
  const onShowSystem = vi.fn();
  createCanvasKeyboard({
    surface,
    controller: createController(),
    onShowSystem,
    ariaLabel: ARIA_LABEL,
  });

  press(surface, { key: 'Home' });
  press(surface, { key: 'Escape' });

  expect(onShowSystem).toHaveBeenCalledTimes(2);
});

test('does not move focus itself', () => {
  const surface = new Surface();
  const focus = vi.spyOn(surface, 'focus');
  const blur = vi.spyOn(surface, 'blur');
  createCanvasKeyboard({
    surface,
    controller: createController(),
    onShowSystem: () => undefined,
    ariaLabel: ARIA_LABEL,
  });

  press(surface, { key: 'Escape' });
  press(surface, { key: 'Home' });

  expect(focus).not.toHaveBeenCalled();
  expect(blur).not.toHaveBeenCalled();
  expect(surface.focusCount).toBe(0);
  expect(surface.blurCount).toBe(0);
});

test('handled keys are prevented', () => {
  const surface = new Surface();
  createCanvasKeyboard({
    surface,
    controller: createController(),
    onShowSystem: () => undefined,
    ariaLabel: ARIA_LABEL,
  });
  const handled = [
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    '+',
    '=',
    '-',
    'PageUp',
    'PageDown',
    'Home',
    'Escape',
  ];

  for (const key of handled) {
    expect(press(surface, { key }).defaultPrevented).toBe(true);
  }

  expect(press(surface, { key: 'Tab' }).defaultPrevented).toBe(false);
  expect(press(surface, { key: 'Tab', shiftKey: true }).defaultPrevented).toBe(
    false,
  );
  expect(press(surface, { key: 'a' }).defaultPrevented).toBe(false);
  expect(press(surface, { key: 'Enter' }).defaultPrevented).toBe(false);
});

test('ctrl meta alt are ignored', () => {
  const surface = new Surface();
  const controller = createController();
  const onShowSystem = vi.fn();
  createCanvasKeyboard({
    surface,
    controller,
    onShowSystem,
    ariaLabel: ARIA_LABEL,
  });
  const modifiers = ['ctrlKey', 'metaKey', 'altKey'] as const;

  for (const modifier of modifiers) {
    const plus = press(surface, { key: '+', [modifier]: true });
    const minus = press(surface, { key: '-', [modifier]: true });
    const arrow = press(surface, { key: 'ArrowLeft', [modifier]: true });
    expect(plus.defaultPrevented).toBe(false);
    expect(minus.defaultPrevented).toBe(false);
    expect(arrow.defaultPrevented).toBe(false);
  }

  expect(controller.rotateBy).not.toHaveBeenCalled();
  expect(controller.zoomBy).not.toHaveBeenCalled();
  expect(onShowSystem).not.toHaveBeenCalled();
});

test('composing events are ignored', () => {
  const surface = new Surface();
  const controller = createController();
  const onShowSystem = vi.fn();
  createCanvasKeyboard({
    surface,
    controller,
    onShowSystem,
    ariaLabel: ARIA_LABEL,
  });

  const event = press(surface, { key: 'ArrowLeft', isComposing: true });

  expect(event.defaultPrevented).toBe(false);
  expect(controller.rotateBy).not.toHaveBeenCalled();
  expect(onShowSystem).not.toHaveBeenCalled();
});

test('repeat repeats action', () => {
  const surface = new Surface();
  const controller = createController();
  createCanvasKeyboard({
    surface,
    controller,
    onShowSystem: () => undefined,
    ariaLabel: ARIA_LABEL,
  });

  press(surface, { key: 'ArrowRight', repeat: true });
  press(surface, { key: 'ArrowRight', repeat: true });
  press(surface, { key: 'ArrowRight', repeat: true });

  expect(controller.rotateBy).toHaveBeenCalledTimes(3);
});

test('listener is on the canvas only', () => {
  const surface = new Surface();
  const other = new Surface();
  const page = new EventTarget();
  const controller = createController();
  createCanvasKeyboard({
    surface,
    controller,
    onShowSystem: () => undefined,
    ariaLabel: ARIA_LABEL,
  });

  press(page, { key: 'ArrowLeft' });
  press(other, { key: 'ArrowLeft' });
  if (typeof window !== 'undefined') {
    press(window, { key: 'ArrowLeft' });
  }

  expect(controller.rotateBy).not.toHaveBeenCalled();
  press(surface, { key: 'ArrowLeft' });
  expect(controller.rotateBy).toHaveBeenCalledTimes(1);
});

test('dispose removes listener and attributes', () => {
  const surface = new Surface();
  const controller = createController();
  const keyboard = createCanvasKeyboard({
    surface,
    controller,
    onShowSystem: () => undefined,
    ariaLabel: ARIA_LABEL,
  });

  keyboard.dispose();
  press(surface, { key: 'ArrowLeft' });
  keyboard.dispose();

  expect(surface.getAttribute('tabindex')).toBeNull();
  expect(surface.getAttribute('aria-label')).toBeNull();
  expect(surface.addCount).toBe(surface.removeCount);
  expect(surface.addCount).toBe(1);
  expect(controller.rotateBy).not.toHaveBeenCalled();
});

test('handler does not allocate', () => {
  const surface = new Surface();
  const controller: CanvasKeyboardController = {
    rotateBy() {
      return undefined;
    },
    zoomBy() {
      return undefined;
    },
  };
  createCanvasKeyboard({
    surface,
    controller,
    onShowSystem() {
      return undefined;
    },
    ariaLabel: ARIA_LABEL,
  });
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'key', { value: 'ArrowLeft', writable: true });
  Object.defineProperty(event, 'shiftKey', { value: false });
  Object.defineProperty(event, 'ctrlKey', { value: false });
  Object.defineProperty(event, 'metaKey', { value: false });
  Object.defineProperty(event, 'altKey', { value: false });
  Object.defineProperty(event, 'isComposing', { value: false });
  Object.defineProperty(event, 'repeat', { value: true });

  const push = vi.spyOn(Array.prototype, 'push');
  const splice = vi.spyOn(Array.prototype, 'splice');
  const mapSet = vi.spyOn(Map.prototype, 'set');
  push.mockClear();
  splice.mockClear();
  mapSet.mockClear();

  try {
    for (let index = 0; index < 10000; index += 1) {
      surface.dispatchEvent(event);
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
});
