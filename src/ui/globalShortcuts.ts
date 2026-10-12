import {
  GLOBAL_KEY_FULLSCREEN,
  GLOBAL_KEY_NONE,
  GLOBAL_KEY_SELECT_BASE,
  GLOBAL_KEY_SELECT_COUNT,
  GLOBAL_KEY_SHOW_SHORTCUTS,
  GLOBAL_KEY_TODAY,
  GLOBAL_KEY_TOGGLE_PAUSE,
  resolveGlobalKey,
  shortcutsAllowedOn,
  type KeyTarget,
} from '@core/keyBindings.ts';

export type GlobalShortcutsOptions = {
  /** The bodies in list order, from the Sun: key 0 is the first, 1 to 8 follow. */
  bodyIds: readonly string[];
  onTogglePause(): void;
  onSelect(id: string): void;
  onToday(): void;
  onShowShortcuts(): void;
  onToggleFullscreen(): void;
  /** Where the keys are listened to; the page. */
  target?: Document;
};

export type GlobalShortcuts = {
  dispose(): void;
};

// Controls that Space operates: with the focus on one, Space stays its own.
const SPACE_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'switch',
  'radio',
  'tab',
  'menuitem',
  'option',
]);

function describeTarget(target: EventTarget | null): KeyTarget {
  if (!(target instanceof HTMLElement)) {
    return {
      tagName: 'BODY',
      inputType: '',
      isContentEditable: false,
      actsOnSpace: false,
      insideModal: false,
    };
  }

  const role = target.getAttribute('role');
  const tag = target.tagName;
  return {
    tagName: tag,
    inputType:
      target instanceof HTMLInputElement ? target.type.toLowerCase() : '',
    isContentEditable: target.isContentEditable,
    actsOnSpace:
      tag === 'BUTTON' ||
      tag === 'SUMMARY' ||
      (tag === 'A' && target.hasAttribute('href')) ||
      (role !== null && SPACE_ROLES.has(role)),
    insideModal: target.closest('[aria-modal="true"]:not([hidden])') !== null,
  };
}

/**
 * Page-wide keys (EMI-242): Space pauses, 0 to 8 pick the Sun and the planets,
 * D goes back to today, F toggles full screen, ? opens the list of shortcuts. The keys that work on
 * the canvas (arrows, +, −, Home, Esc) stay with the canvas.
 */
export function createGlobalShortcuts(
  options: GlobalShortcutsOptions,
): GlobalShortcuts {
  const doc = options.target ?? document;
  let disposed = false;

  function onKeyDown(event: KeyboardEvent): void {
    if (disposed || event.defaultPrevented) {
      return;
    }

    const action = resolveGlobalKey({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      isComposing: event.isComposing,
    });
    if (action === GLOBAL_KEY_NONE) {
      return;
    }
    if (!shortcutsAllowedOn(describeTarget(event.target), event.key)) {
      return;
    }

    if (action === GLOBAL_KEY_TOGGLE_PAUSE) {
      event.preventDefault();
      options.onTogglePause();
      return;
    }
    if (action === GLOBAL_KEY_TODAY) {
      options.onToday();
      return;
    }
    if (action === GLOBAL_KEY_FULLSCREEN) {
      options.onToggleFullscreen();
      return;
    }
    if (action === GLOBAL_KEY_SHOW_SHORTCUTS) {
      event.preventDefault();
      options.onShowShortcuts();
      return;
    }

    const index = action - GLOBAL_KEY_SELECT_BASE;
    if (index >= 0 && index < GLOBAL_KEY_SELECT_COUNT) {
      const id = options.bodyIds[index];
      if (id !== undefined) {
        options.onSelect(id);
      }
    }
  }

  doc.addEventListener('keydown', onKeyDown);

  return {
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      doc.removeEventListener('keydown', onKeyDown);
    },
  };
}
