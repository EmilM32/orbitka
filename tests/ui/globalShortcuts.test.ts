// @vitest-environment jsdom

import { afterEach, expect, test, vi } from 'vitest';

import { createGlobalShortcuts } from '@ui/globalShortcuts.ts';

const BODIES = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
];

afterEach(() => {
  document.body.replaceChildren();
});

function setup() {
  const calls = {
    onTogglePause: vi.fn(),
    onSelect: vi.fn<(id: string) => void>(),
    onToday: vi.fn(),
    onShowShortcuts: vi.fn(),
    onToggleFullscreen: vi.fn(),
  };
  const shortcuts = createGlobalShortcuts({ bodyIds: BODIES, ...calls });
  return { calls, shortcuts };
}

function press(
  target: EventTarget,
  key: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

test('the keys call their actions from the page', () => {
  const { calls } = setup();
  const pause = press(document.body, ' ');
  expect(calls.onTogglePause).toHaveBeenCalledTimes(1);
  // Space must not scroll the page.
  expect(pause.defaultPrevented).toBe(true);
  press(document.body, 'd');
  expect(calls.onToday).toHaveBeenCalledTimes(1);
  press(document.body, 'f');
  press(document.body, 'F', { shiftKey: true });
  expect(calls.onToggleFullscreen).toHaveBeenCalledTimes(2);
  const help = press(document.body, '?', { shiftKey: true });
  expect(calls.onShowShortcuts).toHaveBeenCalledTimes(1);
  expect(help.defaultPrevented).toBe(true);
});

test('digits pick the bodies from the Sun', () => {
  const { calls } = setup();
  for (const [key, id] of [
    ['0', 'sun'],
    ['1', 'mercury'],
    ['3', 'earth'],
    ['5', 'jupiter'],
    ['8', 'neptune'],
  ] as const) {
    press(document.body, key);
    expect(calls.onSelect).toHaveBeenLastCalledWith(id);
  }
  press(document.body, '9');
  expect(calls.onSelect).toHaveBeenCalledTimes(5);
});

test('fields, selects, modals and modifiers are left alone', () => {
  const { calls } = setup();
  const input = document.createElement('input');
  input.type = 'text';
  const select = document.createElement('select');
  const textarea = document.createElement('textarea');
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const inDialog = document.createElement('button');
  dialog.append(inDialog);
  document.body.append(input, select, textarea, dialog);
  for (const target of [input, select, textarea, inDialog]) {
    press(target, '5');
    press(target, ' ');
    press(target, '?');
    press(target, 'f');
  }
  press(document.body, '5', { ctrlKey: true });
  press(document.body, ' ', { altKey: true });
  press(document.body, 'd', { metaKey: true });
  press(document.body, '5', { isComposing: true });
  expect(calls.onSelect).not.toHaveBeenCalled();
  expect(calls.onTogglePause).not.toHaveBeenCalled();
  expect(calls.onToday).not.toHaveBeenCalled();
  expect(calls.onShowShortcuts).not.toHaveBeenCalled();
  expect(calls.onToggleFullscreen).not.toHaveBeenCalled();
});

test('a hidden modal does not block the keys', () => {
  const { calls } = setup();
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.hidden = true;
  const inside = document.createElement('button');
  dialog.append(inside);
  document.body.append(dialog);
  press(inside, '5');
  expect(calls.onSelect).toHaveBeenCalledWith('jupiter');
});

test('Space stays with a button, a link, a slider and a checkbox', () => {
  const { calls } = setup();
  const button = document.createElement('button');
  const link = document.createElement('a');
  link.href = '#x';
  const slider = document.createElement('input');
  slider.type = 'range';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  const custom = document.createElement('div');
  custom.setAttribute('role', 'switch');
  document.body.append(button, link, slider, checkbox, custom);
  for (const target of [button, link, slider, checkbox, custom]) {
    const event = press(target, ' ');
    expect(event.defaultPrevented).toBe(false);
  }
  expect(calls.onTogglePause).not.toHaveBeenCalled();
  // The other keys still work from there.
  press(button, '2');
  press(slider, 'd');
  expect(calls.onSelect).toHaveBeenCalledWith('venus');
  expect(calls.onToday).toHaveBeenCalledTimes(1);
});

test('a key someone else already handled is skipped; dispose stops it', () => {
  const { calls, shortcuts } = setup();
  const handled = (event: Event): void => {
    event.preventDefault();
  };
  document.body.addEventListener('keydown', handled);
  press(document.body, '5');
  document.body.removeEventListener('keydown', handled);
  expect(calls.onSelect).not.toHaveBeenCalled();
  shortcuts.dispose();
  shortcuts.dispose();
  press(document.body, '5');
  expect(calls.onSelect).not.toHaveBeenCalled();
});
