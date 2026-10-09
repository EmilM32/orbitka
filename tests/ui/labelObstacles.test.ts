// @vitest-environment jsdom

import { expect, test, vi } from 'vitest';

import { createLabelObstacles } from '@ui/labelObstacles.ts';

type Callback = () => void;

function fakeObservers() {
  const resize: Callback[] = [];
  const mutation: Callback[] = [];
  const observed: Element[] = [];
  return {
    resize,
    mutation,
    observed,
    createResizeObserver(callback: Callback) {
      resize.push(callback);
      return {
        observe(target: Element) {
          observed.push(target);
        },
        disconnect() {
          observed.length = 0;
        },
      };
    },
    createMutationObserver(callback: Callback) {
      mutation.push(callback);
      return { observe() {}, disconnect() {} };
    },
  };
}

function panel(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  const element = document.createElement('div');
  document.body.append(element);
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        left: rect.left,
        top: rect.top,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        width: rect.width,
        height: rect.height,
        x: rect.left,
        y: rect.top,
        toJSON() {
          return {};
        },
      }) as DOMRect,
  );
  return { element, rect };
}

test('labelObstacles › reads drawn panels and skips hidden, empty and missing ones', () => {
  document.body.replaceChildren();
  const a = panel({ left: 10, top: 20, width: 100, height: 50 });
  const hidden = panel({ left: 0, top: 0, width: 40, height: 40 });
  hidden.element.hidden = true;
  const empty = panel({ left: 0, top: 0, width: 0, height: 0 });
  const observers = fakeObservers();

  const obstacles = createLabelObstacles({
    root: document.body,
    elements: () => [a.element, hidden.element, empty.element, null, undefined],
    ...observers,
  });

  expect(obstacles.count()).toBe(1);
  expect(Array.from(obstacles.rects.subarray(0, 4))).toEqual([10, 20, 110, 70]);
  expect(observers.observed).toEqual([
    a.element,
    hidden.element,
    empty.element,
  ]);

  // Shown again: a mutation re-reads the rects.
  hidden.element.hidden = false;
  for (const callback of observers.mutation) {
    callback();
  }
  expect(obstacles.count()).toBe(2);
  obstacles.dispose();
  expect(obstacles.count()).toBe(0);
});

test('labelObstacles › rects are read on events, not on count()', () => {
  document.body.replaceChildren();
  const a = panel({ left: 0, top: 0, width: 10, height: 10 });
  const observers = fakeObservers();
  const obstacles = createLabelObstacles({
    root: document.body,
    elements: () => [a.element],
    ...observers,
  });
  const reads = vi.mocked(a.element.getBoundingClientRect);
  const before = reads.mock.calls.length;
  for (let index = 0; index < 10; index += 1) {
    obstacles.count();
  }
  expect(reads.mock.calls.length).toBe(before);

  a.rect.left = 30;
  a.element.dispatchEvent(new Event('transitionend', { bubbles: true }));
  expect(obstacles.rects[0]).toBe(30);

  a.rect.left = 40;
  for (const callback of observers.resize) {
    callback();
  }
  expect(obstacles.rects[0]).toBe(40);

  window.dispatchEvent(new Event('resize'));
  obstacles.dispose();
  a.rect.left = 50;
  window.dispatchEvent(new Event('resize'));
  expect(obstacles.rects[0]).toBe(40);
});
