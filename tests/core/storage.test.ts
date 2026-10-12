import { expect, test } from 'vitest';

import {
  createAppStorage,
  migrateLegacyKeys,
  STORAGE_PREFIX,
  type RawStorage,
} from '@core/storage.ts';

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: RawStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
  return { data, storage };
}

test('values live under the versioned prefix', () => {
  expect(STORAGE_PREFIX).toBe('orbitka.v1.');
  const { data, storage } = memory();
  const app = createAppStorage(() => storage);
  app.setItem('orbits', 'false');
  expect(data.get('orbitka.v1.orbits')).toBe('false');
  expect(app.getItem('orbits')).toBe('false');
  app.removeItem('orbits');
  expect(data.size).toBe(0);
});

test('migrates the old keys and removes them', () => {
  const { data, storage } = memory({
    'orbitka.coach.done': '1',
    'orbitka.orbits': 'false',
    'orbitka.quality.auto': 'low',
    'orbitka.quality.override': 'high',
    'other.site.key': 'keep',
  });
  const app = createAppStorage(() => storage);
  expect(app.getItem('coach.done')).toBe('1');
  expect(Object.fromEntries(data)).toEqual({
    'orbitka.v1.coach.done': '1',
    'orbitka.v1.orbits': 'false',
    'orbitka.v1.quality.auto': 'low',
    'orbitka.v1.quality.override': 'high',
    'other.site.key': 'keep',
  });
});

test('drops an invalid old value without migrating it', () => {
  const { data, storage } = memory({
    'orbitka.coach.done': 'yes',
    'orbitka.quality.auto': 'ultra',
  });
  migrateLegacyKeys(storage);
  expect(data.size).toBe(0);
});

test('a value already under the new key wins over the old one', () => {
  const { data, storage } = memory({
    'orbitka.orbits': 'false',
    'orbitka.v1.orbits': 'true',
  });
  migrateLegacyKeys(storage);
  expect(Object.fromEntries(data)).toEqual({ 'orbitka.v1.orbits': 'true' });
});

test('the migration runs once per storage', () => {
  const { data, storage } = memory();
  const app = createAppStorage(() => storage);
  expect(app.getItem('orbits')).toBeNull();
  data.set('orbitka.orbits', 'false');
  expect(app.getItem('orbits')).toBeNull();
});

test('reading an invalid stored value gives null', () => {
  const { storage } = memory({ 'orbitka.v1.quality.auto': 'ultra' });
  expect(createAppStorage(() => storage).getItem('quality.auto')).toBeNull();
});

test('unknown names and invalid values throw RangeError', () => {
  const app = createAppStorage(() => memory().storage);
  expect(() => app.getItem('nope')).toThrow(RangeError);
  expect(() => app.removeItem('nope')).toThrow(RangeError);
  expect(() => app.setItem('nope', '1')).toThrow(RangeError);
  expect(() => app.setItem('orbits', 'maybe')).toThrow(RangeError);
});

test('no storage or a throwing storage throws like Storage does', () => {
  const none = createAppStorage(() => null);
  expect(() => none.getItem('orbits')).toThrow();
  expect(() => none.setItem('orbits', 'true')).toThrow();
  const blocked = createAppStorage(() => {
    throw new Error('SecurityError');
  });
  expect(() => blocked.getItem('orbits')).toThrow('SecurityError');
});
