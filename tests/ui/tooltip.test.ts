// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { createTooltip, TOOLTIP_HOVER_DELAY_MS } from '@ui/tooltip.ts';

const CSS = readFileSync('src/ui/tooltip.css', 'utf8');

function pointer(target: EventTarget, type: string, pointerType: string): void {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
}

function key(target: EventTarget, name: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

let trigger: HTMLButtonElement;

beforeEach(() => {
  document.body.replaceChildren();
  trigger = document.createElement('button');
  trigger.textContent = 'i';
  document.body.append(trigger);
});

afterEach(() => {
  vi.useRealTimers();
});

test('role, id and aria-describedby', () => {
  const tip = createTooltip(trigger, 'Hello', 'right', { id: 'tip-au' });
  expect(tip.element.getAttribute('role')).toBe('tooltip');
  expect(tip.element.id).toBe('tip-au');
  expect(tip.element.hidden).toBe(true);
  expect(trigger.getAttribute('aria-describedby')).toBe('tip-au');
  const other = createTooltip(trigger, 'Other', 'top');
  expect(other.element.id).toMatch(/^tip-\d+$/u);
  expect(trigger.getAttribute('aria-describedby')).toBe(
    `tip-au ${other.element.id}`,
  );
  other.dispose();
  expect(trigger.getAttribute('aria-describedby')).toBe('tip-au');
  tip.dispose();
  expect(trigger.hasAttribute('aria-describedby')).toBe(false);

  const silent = createTooltip(trigger, 'Mars', 'right', { describe: false });
  expect(trigger.hasAttribute('aria-describedby')).toBe(false);
  silent.dispose();
});

test('focus opens at once, blur closes', () => {
  const tip = createTooltip(trigger, 'Hello', 'right');
  trigger.focus();
  expect(tip.element.hidden).toBe(false);
  trigger.blur();
  expect(tip.element.hidden).toBe(true);
  tip.dispose();
});

test('hover opens after 300 ms, leave closes', () => {
  vi.useFakeTimers();
  const tip = createTooltip(trigger, 'Hello', 'bottom');
  pointer(trigger, 'pointerenter', 'mouse');
  vi.advanceTimersByTime(TOOLTIP_HOVER_DELAY_MS - 1);
  expect(tip.element.hidden).toBe(true);
  vi.advanceTimersByTime(1);
  expect(tip.element.hidden).toBe(false);
  pointer(trigger, 'pointerleave', 'mouse');
  expect(tip.element.hidden).toBe(true);

  // Leaving before the delay cancels it.
  pointer(trigger, 'pointerenter', 'mouse');
  pointer(trigger, 'pointerleave', 'mouse');
  vi.advanceTimersByTime(TOOLTIP_HOVER_DELAY_MS);
  expect(tip.element.hidden).toBe(true);
  tip.dispose();
});

test('touch opens it; a touch elsewhere closes it', () => {
  const tip = createTooltip(trigger, 'Hello', 'right');
  pointer(trigger, 'pointerdown', 'touch');
  expect(tip.element.hidden).toBe(false);
  pointer(trigger, 'pointerdown', 'touch');
  expect(tip.element.hidden).toBe(false);
  const outside = document.createElement('div');
  document.body.append(outside);
  pointer(outside, 'pointerdown', 'touch');
  expect(tip.element.hidden).toBe(true);
  tip.dispose();
});

test('Escape closes and stops propagation', () => {
  const tip = createTooltip(trigger, 'Hello', 'right');
  const outer = vi.fn();
  document.body.addEventListener('keydown', outer);
  const closed = key(trigger, 'Escape');
  expect(closed.defaultPrevented).toBe(false);
  expect(outer).toHaveBeenCalledTimes(1);

  trigger.focus();
  const event = key(trigger, 'Escape');
  expect(tip.element.hidden).toBe(true);
  expect(event.defaultPrevented).toBe(true);
  expect(outer).toHaveBeenCalledTimes(1);
  document.body.removeEventListener('keydown', outer);
  tip.dispose();
});

test('stays inside the window', () => {
  const tip = createTooltip(trigger, 'Hello', 'right');
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 1000, y: 740, width: 26, height: 26 }),
  );
  vi.spyOn(tip.element, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: 280, height: 60 }),
  );
  trigger.focus();
  expect(tip.element.style.left).toBe(`${window.innerWidth - 8 - 280}px`);
  expect(tip.element.style.top).toBe(`${window.innerHeight - 8 - 60}px`);
  tip.dispose();
});

test('setText takes text or nodes', () => {
  const tip = createTooltip(trigger, 'Hello', 'right');
  tip.setText('Mars');
  expect(tip.element.textContent).toBe('Mars');
  const strong = document.createElement('strong');
  strong.textContent = '1 j.a.';
  tip.setText(strong);
  expect(tip.element.querySelector('strong')?.textContent).toBe('1 j.a.');
  tip.dispose();
});

test('dispose removes the element and the listeners', () => {
  vi.useFakeTimers();
  const tip = createTooltip(trigger, 'Hello', 'right');
  pointer(trigger, 'pointerenter', 'mouse');
  tip.dispose();
  expect(tip.element.isConnected).toBe(false);
  vi.advanceTimersByTime(TOOLTIP_HOVER_DELAY_MS);
  trigger.focus();
  expect(tip.element.hidden).toBe(true);
  tip.dispose();
});

test('css: fade-in on the shared layer', () => {
  expect(CSS).toContain('z-index: var(--z-tooltip)');
  expect(CSS).toContain('transition: opacity var(--dur-fast) var(--ease-out)');
  expect(CSS).toContain('@starting-style');
  expect(CSS).toContain('pointer-events: none');
});
