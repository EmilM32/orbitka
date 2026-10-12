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

/** Global key action, for the whole page (EMI-242). */
export const GLOBAL_KEY_NONE = 0;
export const GLOBAL_KEY_TOGGLE_PAUSE = 1;
export const GLOBAL_KEY_TODAY = 2;
export const GLOBAL_KEY_SHOW_SHORTCUTS = 3;
export const GLOBAL_KEY_FULLSCREEN = 4;
/**
 * `GLOBAL_KEY_SELECT_BASE + n` selects the n-th body of the list, counted
 * from the Sun: 0 is the Sun, 1 to 8 are the planets.
 */
export const GLOBAL_KEY_SELECT_BASE = 10;
export const GLOBAL_KEY_SELECT_COUNT = 9;

export type GlobalKeyInput = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  isComposing: boolean;
};

/**
 * Map a key to a page-wide action. Keys with Ctrl, Meta or Alt belong to the
 * browser and give none. Shift is not checked: "?" needs it on most layouts.
 */
export function resolveGlobalKey(input: GlobalKeyInput): number {
  if (input.isComposing || input.ctrlKey || input.metaKey || input.altKey) {
    return GLOBAL_KEY_NONE;
  }

  switch (input.key) {
    case ' ':
      return GLOBAL_KEY_TOGGLE_PAUSE;
    case 'd':
    case 'D':
      return GLOBAL_KEY_TODAY;
    case 'f':
    case 'F':
      return GLOBAL_KEY_FULLSCREEN;
    case '?':
      return GLOBAL_KEY_SHOW_SHORTCUTS;
    default:
      break;
  }

  if (input.key.length === 1 && input.key >= '0' && input.key <= '8') {
    return GLOBAL_KEY_SELECT_BASE + (input.key.charCodeAt(0) - 48);
  }

  return GLOBAL_KEY_NONE;
}

/** What has the focus, as far as a shortcut needs to know. */
export type KeyTarget = {
  tagName: string;
  /** The `type` of an input, lower case; empty for other elements. */
  inputType: string;
  isContentEditable: boolean;
  /** An ARIA role that acts on Space (button, link, checkbox, switch…). */
  actsOnSpace: boolean;
  insideModal: boolean;
};

const TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/**
 * Whether a global shortcut may run with the focus on `target`. Not in a
 * field for typing, not in a select, not under a modal dialog. Space on a
 * slider or a control that Space operates is left to that element.
 */
export function shortcutsAllowedOn(target: KeyTarget, key: string): boolean {
  if (target.insideModal || target.isContentEditable) {
    return false;
  }

  const tag = target.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select') {
    return false;
  }
  if (tag === 'input' && !TEXT_INPUT_TYPES.has(target.inputType)) {
    return false;
  }
  if (key === ' ' && (target.actsOnSpace || tag === 'input')) {
    return false;
  }

  return true;
}
