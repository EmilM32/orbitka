import { describe, expect, it, test, vi } from 'vitest';

import { createViewInsets } from '@core/viewInsets.ts';

test('starts at zero', () => {
  expect(createViewInsets().get()).toEqual({ right: 0, bottom: 0 });
});

test('notifies on change only', () => {
  const store = createViewInsets();
  const listener = vi.fn();
  store.subscribe(listener);
  store.set({ right: 352, bottom: 0 });
  store.set({ right: 352, bottom: 0 });
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenLastCalledWith({ right: 352, bottom: 0 });
  store.set({ right: 0, bottom: 0 });
  expect(listener).toHaveBeenCalledTimes(2);
  expect(store.get()).toEqual({ right: 0, bottom: 0 });
});

test('unsubscribe stops notifications', () => {
  const store = createViewInsets();
  const first = vi.fn();
  const second = vi.fn();
  const unsubscribeFirst = store.subscribe(first);
  // Unsubscribing during a notification does not skip the others.
  const unsubscribeSecond = store.subscribe(() => {
    second();
    unsubscribeFirst();
  });
  store.set({ right: 10, bottom: 0 });
  store.set({ right: 20, bottom: 0 });
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(2);
  unsubscribeSecond();
  store.set({ right: 30, bottom: 0 });
  expect(second).toHaveBeenCalledTimes(2);
});

test('a throwing listener does not stop the others', () => {
  const store = createViewInsets();
  const after = vi.fn();
  store.subscribe(() => {
    throw new Error('listener failed');
  });
  store.subscribe(after);
  expect(() => store.set({ right: 0, bottom: 112 })).toThrow('listener failed');
  expect(after).toHaveBeenCalledTimes(1);
  expect(store.get()).toEqual({ right: 0, bottom: 112 });
});

describe('rejects invalid insets', () => {
  it.each([
    [{ right: -1, bottom: 0 }, 'right', '-1'],
    [{ right: Number.NaN, bottom: 0 }, 'right', 'NaN'],
    [{ right: 0, bottom: Number.POSITIVE_INFINITY }, 'bottom', 'Infinity'],
    [{ right: 0, bottom: -5 }, 'bottom', '-5'],
  ])('%o', (insets, name, shown) => {
    const store = createViewInsets();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(() => store.set(insets)).toThrow(
      new RangeError(
        `viewInsets.set: parameter "insets.${name}" must be finite and >= 0, got ${shown}`,
      ),
    );
    expect(store.get()).toEqual({ right: 0, bottom: 0 });
    expect(listener).not.toHaveBeenCalled();
  });
});
