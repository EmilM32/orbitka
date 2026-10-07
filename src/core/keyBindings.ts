/** Canvas key action. Shift does not change the action; the step is chosen later. */
export const CANVAS_KEY_NONE = 0;
export const CANVAS_KEY_ROTATE_LEFT = 1;
export const CANVAS_KEY_ROTATE_RIGHT = 2;
export const CANVAS_KEY_ROTATE_UP = 3;
export const CANVAS_KEY_ROTATE_DOWN = 4;
export const CANVAS_KEY_ZOOM_IN = 5;
export const CANVAS_KEY_ZOOM_OUT = 6;
export const CANVAS_KEY_SHOW_SYSTEM = 7;

export type CanvasKeyInput = {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
};

/**
 * Map a key to a canvas action. Ctrl, Meta, and Alt are filtered by the caller.
 * `shiftKey` is part of the input and does not change the action.
 */
export function resolveCanvasKey(input: CanvasKeyInput): number {
  if (input.isComposing) {
    return CANVAS_KEY_NONE;
  }

  switch (input.key) {
    case 'ArrowLeft':
      return CANVAS_KEY_ROTATE_LEFT;
    case 'ArrowRight':
      return CANVAS_KEY_ROTATE_RIGHT;
    case 'ArrowUp':
      return CANVAS_KEY_ROTATE_UP;
    case 'ArrowDown':
      return CANVAS_KEY_ROTATE_DOWN;
    case '+':
    case '=':
    case 'PageUp':
      return CANVAS_KEY_ZOOM_IN;
    case '-':
    case 'PageDown':
      return CANVAS_KEY_ZOOM_OUT;
    case 'Home':
    case 'Escape':
      return CANVAS_KEY_SHOW_SYSTEM;
    default:
      return CANVAS_KEY_NONE;
  }
}
