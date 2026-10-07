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
  resolveCanvasKey,
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
