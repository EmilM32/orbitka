import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import {
  CANVAS_KEY_NONE,
  CANVAS_KEY_ROTATE_DOWN,
  CANVAS_KEY_ROTATE_LEFT,
  CANVAS_KEY_ROTATE_RIGHT,
  CANVAS_KEY_ROTATE_UP,
  CANVAS_KEY_SHOW_SYSTEM,
  CANVAS_KEY_ZOOM_IN,
  CANVAS_KEY_ZOOM_OUT,
  resolveCanvasKey,
  type CanvasKeyInput,
} from '@core/keyBindings.ts';

const DEGREE_RADIANS = Math.PI / 180;
const ROTATE_STEP = CAMERA_CONFIG.keyRotateStepDeg * DEGREE_RADIANS;
const ROTATE_STEP_SHIFT = CAMERA_CONFIG.keyRotateStepShiftDeg * DEGREE_RADIANS;

export type CanvasKeyboard = {
  dispose(): void;
};

/** Structural surface so tests can use an `EventTarget` instead of a canvas. */
export type CanvasKeyboardSurface = {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  getAttribute(name: string): string | null;
  addEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: EventListenerOptions | boolean,
  ): void;
};

export type CanvasKeyboardController = {
  rotateBy(
    dAzimuth: number,
    dPolar: number,
    smooth: boolean,
    notify?: boolean,
  ): void;
  zoomBy(factor: number, smooth: boolean, notify?: boolean): void;
};

export type CanvasKeyboardOptions = {
  surface: CanvasKeyboardSurface;
  controller: CanvasKeyboardController;
  onShowSystem: () => void;
  ariaLabel: string;
};

export function createCanvasKeyboard(
  options: CanvasKeyboardOptions,
): CanvasKeyboard {
  const input: CanvasKeyInput = {
    key: '',
    shiftKey: false,
    isComposing: false,
  };
  let disposed = false;

  options.surface.setAttribute('tabindex', '0');
  options.surface.setAttribute('aria-label', options.ariaLabel);
  options.surface.addEventListener('keydown', onKeyDown);

  function onKeyDown(event: Event): void {
    if (disposed) {
      return;
    }

    const keyEvent = event as KeyboardEvent;
    if (keyEvent.ctrlKey || keyEvent.metaKey || keyEvent.altKey) {
      return;
    }

    input.key = keyEvent.key;
    input.shiftKey = keyEvent.shiftKey;
    input.isComposing = keyEvent.isComposing;
    const action = resolveCanvasKey(input);
    if (action === CANVAS_KEY_NONE) {
      return;
    }

    event.preventDefault();
    const step = input.shiftKey ? ROTATE_STEP_SHIFT : ROTATE_STEP;
    switch (action) {
      case CANVAS_KEY_ROTATE_LEFT:
        options.controller.rotateBy(-step, 0, false);
        return;
      case CANVAS_KEY_ROTATE_RIGHT:
        options.controller.rotateBy(step, 0, false);
        return;
      case CANVAS_KEY_ROTATE_UP:
        options.controller.rotateBy(0, -step, false);
        return;
      case CANVAS_KEY_ROTATE_DOWN:
        options.controller.rotateBy(0, step, false);
        return;
      case CANVAS_KEY_ZOOM_IN:
        options.controller.zoomBy(CAMERA_CONFIG.zoomStepIn, false);
        return;
      case CANVAS_KEY_ZOOM_OUT:
        options.controller.zoomBy(CAMERA_CONFIG.zoomStepOut, false);
        return;
      case CANVAS_KEY_SHOW_SYSTEM:
        options.onShowSystem();
        return;
      default:
        return;
    }
  }

  return {
    dispose(): void {
      if (disposed) {
        return;
      }

      disposed = true;
      options.surface.removeEventListener('keydown', onKeyDown);
      options.surface.removeAttribute('tabindex');
      options.surface.removeAttribute('aria-label');
    },
  };
}
