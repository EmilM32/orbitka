// @vitest-environment jsdom

import { afterEach, expect, test, vi } from 'vitest';

import { createIntroReveal } from '@ui/introReveal.ts';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

function panels(count: number): HTMLElement[] {
  const list: HTMLElement[] = [];
  for (let index = 0; index < count; index += 1) {
    const panel = document.createElement('div');
    panel.id = `panel-${index}`;
    document.body.append(panel);
    list.push(panel);
  }
  return list;
}

function hidden(list: HTMLElement[]): boolean[] {
  return list.map((panel) => panel.classList.contains('intro-hidden'));
}

test('hide marks every panel; nothing else changes', () => {
  const list = panels(3);
  const reveal = createIntroReveal({ panels: list, staggerMs: 60 });
  reveal.hide();
  expect(hidden(list)).toEqual([true, true, true]);
  expect(list.every((panel) => panel.classList.contains('intro-panel'))).toBe(
    true,
  );
  expect(reveal.isPending()).toBe(true);
  // A second hide is the same as the first.
  reveal.hide();
  expect(hidden(list)).toEqual([true, true, true]);
  reveal.dispose();
});

test('start shows the panels one after another, 60 ms apart', () => {
  vi.useFakeTimers();
  const list = panels(3);
  const reveal = createIntroReveal({ panels: list, staggerMs: 60 });
  reveal.hide();
  reveal.start(1000);
  vi.advanceTimersByTime(999);
  expect(hidden(list)).toEqual([true, true, true]);
  vi.advanceTimersByTime(1);
  expect(hidden(list)).toEqual([false, true, true]);
  vi.advanceTimersByTime(60);
  expect(hidden(list)).toEqual([false, false, true]);
  vi.advanceTimersByTime(60);
  expect(hidden(list)).toEqual([false, false, false]);
  expect(reveal.isPending()).toBe(false);
  // The transition class goes once the panel has settled.
  vi.advanceTimersByTime(400);
  expect(list.some((panel) => panel.classList.contains('intro-panel'))).toBe(
    false,
  );
  reveal.dispose();
});

test('finish shows every panel now and cancels the schedule', () => {
  vi.useFakeTimers();
  const list = panels(3);
  const reveal = createIntroReveal({ panels: list, staggerMs: 60 });
  reveal.hide();
  reveal.start(1000);
  vi.advanceTimersByTime(1000);
  expect(hidden(list)).toEqual([false, true, true]);
  reveal.finish();
  expect(hidden(list)).toEqual([false, false, false]);
  expect(reveal.isPending()).toBe(false);
  vi.advanceTimersByTime(5000);
  expect(list.some((panel) => panel.classList.contains('intro-panel'))).toBe(
    false,
  );
  // Nothing left to start.
  reveal.start(0);
  vi.advanceTimersByTime(100);
  expect(hidden(list)).toEqual([false, false, false]);
});

test('missing panels are skipped; no panels is fine', () => {
  vi.useFakeTimers();
  const list = panels(2);
  const reveal = createIntroReveal({
    panels: [list[0], null, undefined, list[1]],
    staggerMs: 60,
  });
  reveal.hide();
  reveal.start(0);
  vi.advanceTimersByTime(0);
  expect(hidden(list)).toEqual([false, true]);
  vi.advanceTimersByTime(60);
  expect(hidden(list)).toEqual([false, false]);
  reveal.dispose();

  const none = createIntroReveal({ panels: [], staggerMs: 60 });
  none.hide();
  none.start(0);
  none.finish();
  expect(none.isPending()).toBe(false);
});

test('start before hide does nothing; dispose puts everything back', () => {
  vi.useFakeTimers();
  const list = panels(2);
  const reveal = createIntroReveal({ panels: list, staggerMs: 60 });
  reveal.start(0);
  vi.advanceTimersByTime(1000);
  expect(hidden(list)).toEqual([false, false]);
  reveal.hide();
  reveal.dispose();
  expect(list.every((panel) => panel.className === '')).toBe(true);
  reveal.hide();
  expect(hidden(list)).toEqual([false, false]);
});

test('a panel shown by someone else is left alone by the schedule', () => {
  vi.useFakeTimers();
  const list = panels(2);
  const reveal = createIntroReveal({ panels: list, staggerMs: 60 });
  reveal.hide();
  list[0]?.classList.remove('intro-hidden');
  reveal.start(0);
  vi.advanceTimersByTime(200);
  expect(hidden(list)).toEqual([false, false]);
  reveal.dispose();
});
