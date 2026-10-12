import { expect, test } from 'vitest';

import {
  CANVAS_KEY_NONE,
  CANVAS_KEY_ROTATE_DOWN,
  CANVAS_KEY_ROTATE_LEFT,
  CANVAS_KEY_ROTATE_RIGHT,
  CANVAS_KEY_ROTATE_UP,
  CANVAS_KEY_SHOW_SYSTEM,
  CANVAS_KEY_ZOOM_IN,
  CANVAS_KEY_ZOOM_OUT,
  GLOBAL_KEY_NONE,
  GLOBAL_KEY_SELECT_BASE,
  GLOBAL_KEY_SHOW_SHORTCUTS,
  GLOBAL_KEY_TODAY,
  GLOBAL_KEY_TOGGLE_PAUSE,
  resolveCanvasKey,
  resolveGlobalKey,
  shortcutsAllowedOn,
  type KeyTarget,
} from '@core/keyBindings.ts';

test('resolveCanvasKey table', () => {
  const rows: {
    key: string;
    shiftKey: boolean;
    isComposing: boolean;
    action: number;
  }[] = [
    {
      key: 'ArrowLeft',
      shiftKey: false,
      isComposing: false,
      action: CANVAS_KEY_ROTATE_LEFT,
    },
    {
      key: 'ArrowRight',
      shiftKey: false,
      isComposing: false,
      action: CANVAS_KEY_ROTATE_RIGHT,
    },
    {
      key: 'ArrowUp',
      shiftKey: false,
      isComposing: false,
      action: CANVAS_KEY_ROTATE_UP,
    },
    {
      key: 'ArrowDown',
      shiftKey: false,
      isComposing: false,
      action: CANVAS_KEY_ROTATE_DOWN,
    },
    {
      key: 'ArrowLeft',
      shiftKey: true,
      isComposing: false,
      action: CANVAS_KEY_ROTATE_LEFT,
    },
    {
      key: '+',
      shiftKey: false,
      isComposing: false,
      action: CANVAS_KEY_ZOOM_IN,
    },
    {
      key: '+',
      shiftKey: true,
      isComposing: false,
      action: CANVAS_KEY_ZOOM_IN,
    },
    {
      key: '=',
      shiftKey: false,
      isComposing: false,
      action: CANVAS_KEY_ZOOM_IN,
    },
    {
      key: 'PageUp',
      shiftKey: false,
      isComposing: false,
      action: CANVAS_KEY_ZOOM_IN,
    },
    {
      key: '-',
      shiftKey: false,
      isComposing: false,
      action: CANVAS_KEY_ZOOM_OUT,
    },
    {
      key: 'PageDown',
      shiftKey: false,
      isComposing: false,
      action: CANVAS_KEY_ZOOM_OUT,
    },
    {
      key: 'Home',
      shiftKey: false,
      isComposing: false,
      action: CANVAS_KEY_SHOW_SYSTEM,
    },
    {
      key: 'Escape',
      shiftKey: false,
      isComposing: false,
      action: CANVAS_KEY_SHOW_SYSTEM,
    },
    {
      key: 'ArrowLeft',
      shiftKey: false,
      isComposing: true,
      action: CANVAS_KEY_NONE,
    },
    { key: 'a', shiftKey: false, isComposing: false, action: CANVAS_KEY_NONE },
    {
      key: 'Tab',
      shiftKey: false,
      isComposing: false,
      action: CANVAS_KEY_NONE,
    },
    {
      key: 'Tab',
      shiftKey: true,
      isComposing: false,
      action: CANVAS_KEY_NONE,
    },
    {
      key: 'Enter',
      shiftKey: false,
      isComposing: false,
      action: CANVAS_KEY_NONE,
    },
  ];

  for (const row of rows) {
    expect(
      resolveCanvasKey({
        key: row.key,
        shiftKey: row.shiftKey,
        isComposing: row.isComposing,
      }),
    ).toBe(row.action);
  }
});

function globalKey(
  key: string,
  extra: Partial<Parameters<typeof resolveGlobalKey>[0]> = {},
): number {
  return resolveGlobalKey({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    ...extra,
  });
}

test.each([
  [' ', GLOBAL_KEY_TOGGLE_PAUSE],
  ['d', GLOBAL_KEY_TODAY],
  ['D', GLOBAL_KEY_TODAY],
  ['?', GLOBAL_KEY_SHOW_SHORTCUTS],
  ['0', GLOBAL_KEY_SELECT_BASE],
  ['1', GLOBAL_KEY_SELECT_BASE + 1],
  ['5', GLOBAL_KEY_SELECT_BASE + 5],
  ['8', GLOBAL_KEY_SELECT_BASE + 8],
  ['9', GLOBAL_KEY_NONE],
  ['a', GLOBAL_KEY_NONE],
  ['Enter', GLOBAL_KEY_NONE],
  ['ArrowLeft', GLOBAL_KEY_NONE],
  ['Escape', GLOBAL_KEY_NONE],
  ['10', GLOBAL_KEY_NONE],
  ['', GLOBAL_KEY_NONE],
])('globalKey › %j', (key, expected) => {
  expect(globalKey(key)).toBe(expected);
});

test('globalKey › Ctrl, Meta, Alt and composition give none', () => {
  for (const extra of [
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { isComposing: true },
  ]) {
    for (const key of [' ', 'd', '?', '3']) {
      expect(globalKey(key, extra), `${key} ${JSON.stringify(extra)}`).toBe(
        GLOBAL_KEY_NONE,
      );
    }
  }
});

function target(extra: Partial<KeyTarget> = {}): KeyTarget {
  return {
    tagName: 'DIV',
    inputType: '',
    isContentEditable: false,
    actsOnSpace: false,
    insideModal: false,
    ...extra,
  };
}

test('shortcutsAllowedOn › the page, the canvas and plain elements allow them', () => {
  for (const key of [' ', 'd', '?', '3']) {
    expect(shortcutsAllowedOn(target(), key)).toBe(true);
    expect(shortcutsAllowedOn(target({ tagName: 'CANVAS' }), key)).toBe(true);
    expect(shortcutsAllowedOn(target({ tagName: 'BODY' }), key)).toBe(true);
  }
});

test('shortcutsAllowedOn › fields for typing, selects and modals block all keys', () => {
  const blocked: KeyTarget[] = [
    target({ tagName: 'INPUT', inputType: 'text' }),
    target({ tagName: 'INPUT', inputType: 'search' }),
    target({ tagName: 'INPUT', inputType: 'number' }),
    target({ tagName: 'INPUT', inputType: '' }),
    target({ tagName: 'TEXTAREA' }),
    target({ tagName: 'SELECT' }),
    target({ isContentEditable: true }),
    target({ insideModal: true }),
    target({ tagName: 'BUTTON', insideModal: true }),
  ];
  for (const item of blocked) {
    for (const key of [' ', 'd', '?', '3']) {
      expect(shortcutsAllowedOn(item, key), `${item.tagName} ${key}`).toBe(
        false,
      );
    }
  }
});

test('shortcutsAllowedOn › the slider and buttons keep Space, but not the other keys', () => {
  const slider = target({ tagName: 'INPUT', inputType: 'range' });
  expect(shortcutsAllowedOn(slider, ' ')).toBe(false);
  expect(shortcutsAllowedOn(slider, '5')).toBe(true);
  expect(shortcutsAllowedOn(slider, '?')).toBe(true);
  const button = target({ tagName: 'BUTTON', actsOnSpace: true });
  expect(shortcutsAllowedOn(button, ' ')).toBe(false);
  expect(shortcutsAllowedOn(button, '5')).toBe(true);
  const checkbox = target({ tagName: 'INPUT', inputType: 'checkbox' });
  expect(shortcutsAllowedOn(checkbox, ' ')).toBe(false);
  expect(shortcutsAllowedOn(checkbox, 'd')).toBe(true);
});
