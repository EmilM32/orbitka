import { expect, test } from 'vitest';

import {
  createReducedMotion,
  type MediaQueryListLike,
} from '@core/reducedMotion.ts';

test('reducedMotion › matches, subscribe, dispose', () => {
  expect(typeof globalThis.window).toBe('undefined');
  expect(typeof globalThis.document).toBe('undefined');

  let matches = false;
  let queryText = '';
  const queryListeners: Array<() => void> = [];
  let removed = 0;
  const query: MediaQueryListLike = {
    get matches() {
      return matches;
    },
    addEventListener(_type: 'change', listener: () => void) {
      queryListeners.push(listener);
    },
    removeEventListener(_type: 'change', listener: () => void) {
      removed += 1;
      const index = queryListeners.indexOf(listener);
      if (index >= 0) {
        queryListeners.splice(index, 1);
      }
    },
  };

  const motion = createReducedMotion((queryString) => {
    queryText = queryString;
    return query;
  });

  expect(queryText).toBe('(prefers-reduced-motion: reduce)');
  expect(motion.matches).toBe(false);

  let calls = 0;
  let seen = false;
  const unsubscribe = motion.subscribe(() => {
    calls += 1;
    seen = motion.matches;
  });

  matches = true;
  queryListeners[0]?.();
  expect(calls).toBe(1);
  expect(seen).toBe(true);
  expect(motion.matches).toBe(true);

  unsubscribe();
  matches = false;
  queryListeners[0]?.();
  expect(calls).toBe(1);

  motion.dispose();
  expect(removed).toBe(1);
  expect(queryListeners).toHaveLength(0);
  motion.dispose();
  expect(removed).toBe(1);
});
