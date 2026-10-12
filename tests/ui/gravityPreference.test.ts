import { expect, test } from 'vitest';

import {
  loadGravityVisible,
  saveGravityVisible,
  type GravityStorage,
} from '@ui/gravityPreference.ts';

function memory(value: string | null): GravityStorage & { saved: string[] } {
  const saved: string[] = [];
  return {
    saved,
    getItem: (key) => (key === 'gravity' ? value : null),
    setItem: (key, stored) => {
      saved.push(`${key}=${stored}`);
    },
  };
}

test('gravityPreference › only the exact string true shows the grid', () => {
  expect(loadGravityVisible(memory('true'))).toBe(true);
  for (const value of ['false', '1', 'TRUE', '', null]) {
    expect(loadGravityVisible(memory(value))).toBe(false);
  }
  expect(loadGravityVisible(null)).toBe(false);
});

test('gravityPreference › saves true or false under its key', () => {
  const storage = memory(null);
  saveGravityVisible(storage, true);
  saveGravityVisible(storage, false);
  expect(storage.saved).toEqual(['gravity=true', 'gravity=false']);
  expect(() => saveGravityVisible(null, true)).not.toThrow();
});

test('gravityPreference › a blocked storage is not an error', () => {
  const blocked: GravityStorage = {
    getItem(): string | null {
      throw new Error('getItem blocked');
    },
    setItem(): void {
      throw new Error('setItem blocked');
    },
  };
  expect(loadGravityVisible(blocked)).toBe(false);
  expect(() => saveGravityVisible(blocked, true)).not.toThrow();
});
