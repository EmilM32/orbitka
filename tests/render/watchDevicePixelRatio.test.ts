import { expect, test } from 'vitest';

import { watchDevicePixelRatio } from '@render/watchDevicePixelRatio.ts';

type FakeQuery = {
  addEventListener: (type: 'change', listener: () => void) => void;
  removeEventListener: (type: 'change', listener: () => void) => void;
  fire: () => void;
  listenerCount: () => number;
};

function createMatchMedia() {
  const queries = new Map<string, Set<() => void>>();

  const matchMedia = (query: string): FakeQuery => {
    let listeners = queries.get(query);
    if (!listeners) {
      listeners = new Set();
      queries.set(query, listeners);
    }

    const bucket = listeners;

    return {
      addEventListener(_type, listener) {
        bucket.add(listener);
      },
      removeEventListener(_type, listener) {
        bucket.delete(listener);
      },
      fire() {
        for (const listener of [...bucket]) {
          listener();
        }
      },
      listenerCount() {
        return bucket.size;
      },
    };
  };

  return {
    matchMedia,
    query(name: string) {
      return matchMedia(name);
    },
  };
}

test('resubscribes to the new device pixel ratio after a change', () => {
  const media = createMatchMedia();
  let devicePixelRatio = 1;
  let changes = 0;

  watchDevicePixelRatio({
    getDevicePixelRatio: () => devicePixelRatio,
    matchMedia: media.matchMedia,
    onChange() {
      changes += 1;
      devicePixelRatio = 2;
    },
  });

  expect(media.query('(resolution: 1dppx)').listenerCount()).toBe(1);

  media.query('(resolution: 1dppx)').fire();

  expect(changes).toBe(1);
  expect(media.query('(resolution: 1dppx)').listenerCount()).toBe(0);
  expect(media.query('(resolution: 2dppx)').listenerCount()).toBe(1);
});

test('dispose removes the listener and ignores a later change', () => {
  const media = createMatchMedia();
  let changes = 0;

  const watch = watchDevicePixelRatio({
    getDevicePixelRatio: () => 1,
    matchMedia: media.matchMedia,
    onChange() {
      changes += 1;
    },
  });

  watch.dispose();
  watch.dispose();
  media.query('(resolution: 1dppx)').fire();

  expect(changes).toBe(0);
  expect(media.query('(resolution: 1dppx)').listenerCount()).toBe(0);
  expect(media.query('(resolution: 2dppx)').listenerCount()).toBe(0);
});
