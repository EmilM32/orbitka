// @vitest-environment jsdom

import { expect, test } from 'vitest';

import {
  createLayoutObserver,
  type LayoutHeightListener,
  type LayoutObserverFactory,
} from '@ui/layoutObserver.ts';

test('sets time panel height', () => {
  const root = document.createElement('div');
  const target = document.createElement('div');
  document.body.append(root, target);

  const calls: LayoutHeightListener[] = [];
  let disconnects = 0;
  const createObserver: LayoutObserverFactory = (callback) => {
    calls.push(callback);
    return {
      observe(observedTarget: Element) {
        expect(observedTarget).toBe(target);
      },
      disconnect() {
        disconnects += 1;
      },
    };
  };
  const observed = createLayoutObserver({
    target,
    root,
    createObserver,
  });
  const notify = calls[0];
  if (notify === undefined) {
    throw new Error('observer callback was not captured');
  }
  notify([{ contentRect: { height: 30.2 } }]);
  expect(root.style.getPropertyValue('--time-panel-height')).toBe('31px');
  observed.dispose();
  expect(root.style.getPropertyValue('--time-panel-height')).toBe('');
  expect(disconnects).toBe(1);
  observed.dispose();
  expect(disconnects).toBe(1);

  const previous = globalThis.ResizeObserver;
  Reflect.deleteProperty(globalThis, 'ResizeObserver');
  try {
    const bare = createLayoutObserver({ target, root });
    expect(root.style.getPropertyValue('--time-panel-height')).toBe('0px');
    bare.dispose();
    expect(root.style.getPropertyValue('--time-panel-height')).toBe('');
    bare.dispose();
  } finally {
    if (previous !== undefined) {
      globalThis.ResizeObserver = previous;
    }
    root.remove();
    target.remove();
  }
});
