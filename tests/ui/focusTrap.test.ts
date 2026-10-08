// @vitest-environment jsdom

import { expect, test } from 'vitest';

import { createFocusTrap } from '@ui/focusTrap.ts';

function tab(shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
}

function container(...ids: string[]): HTMLElement {
  document.body.replaceChildren();
  const outside = document.createElement('button');
  outside.id = 'outside';
  const box = document.createElement('div');
  for (const id of ids) {
    const button = document.createElement('button');
    button.id = id;
    box.append(button);
  }
  document.body.append(outside, box);
  return box;
}

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`missing ${id}`);
  }
  return element;
}

test('focusTrap › Tab wraps both ways', () => {
  const box = container('first', 'middle', 'last');
  const trap = createFocusTrap(box);

  trap.activate(byId('last'));
  expect(document.activeElement).toBe(byId('last'));
  expect(tab().defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(byId('first'));
  expect(tab(true).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(byId('last'));

  // Inside the list the browser moves focus itself.
  byId('first').focus();
  expect(tab().defaultPrevented).toBe(false);

  trap.dispose();
});

test('focusTrap › skips hidden, disabled and negative tabindex', () => {
  const box = container('first', 'hidden', 'disabled', 'last');
  byId('hidden').hidden = true;
  (byId('disabled') as HTMLButtonElement).disabled = true;
  const skipped = document.createElement('span');
  skipped.tabIndex = -1;
  box.append(skipped);
  const trap = createFocusTrap(box);

  trap.activate(byId('first'));
  tab(true);
  expect(document.activeElement).toBe(byId('last'));

  trap.dispose();
});

test('focusTrap › deactivate releases', () => {
  const box = container('first', 'last');
  const trap = createFocusTrap(box);

  trap.activate(byId('first'));
  trap.deactivate();
  byId('last').focus();
  expect(tab().defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(byId('last'));

  trap.dispose();
  trap.activate(byId('first'));
  byId('last').focus();
  expect(tab().defaultPrevented).toBe(false);
});

test('focusTrap › container without focusable elements gets the focus', () => {
  const box = container();
  box.append(document.createElement('p'));
  const trap = createFocusTrap(box);

  expect(() => trap.activate(box)).not.toThrow();
  expect(box.getAttribute('tabindex')).toBe('-1');
  expect(document.activeElement).toBe(box);
  expect(tab().defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(box);

  trap.deactivate();
  expect(box.hasAttribute('tabindex')).toBe(false);
  trap.dispose();
});

test('focusTrap › initial outside the container falls back to the first', () => {
  const box = container('first', 'last');
  const trap = createFocusTrap(box);

  trap.activate(byId('outside'));
  expect(document.activeElement).toBe(byId('first'));
  trap.dispose();
});
