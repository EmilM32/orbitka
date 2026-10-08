import { expect, test } from 'vitest';

import {
  COACH_STORAGE_KEY,
  loadCoachDone,
  saveCoachDone,
  type CoachStorage,
  type CoachStorages,
} from '@ui/coachPreference.ts';

function memoryStorage(): CoachStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function throwing(): CoachStorage {
  throw new Error('SecurityError');
}

test('key and value', () => {
  expect(COACH_STORAGE_KEY).toBe('orbitka.coach.done');
  const local = memoryStorage();
  const storages: CoachStorages = {
    local: () => local,
    session: () => memoryStorage(),
    memory: { done: false },
  };
  expect(loadCoachDone(storages)).toBe(false);
  saveCoachDone(storages);
  expect(local.data.get('orbitka.coach.done')).toBe('1');
  expect(loadCoachDone({ ...storages, memory: { done: false } })).toBe(true);
  local.data.set('orbitka.coach.done', 'yes');
  expect(loadCoachDone({ ...storages, memory: { done: false } })).toBe(false);
});

test('localStorage throws: sessionStorage', () => {
  const session = memoryStorage();
  const storages: CoachStorages = {
    local: throwing,
    session: () => session,
    memory: { done: false },
  };
  expect(loadCoachDone(storages)).toBe(false);
  saveCoachDone(storages);
  expect(session.data.get('orbitka.coach.done')).toBe('1');
  expect(loadCoachDone({ ...storages, memory: { done: false } })).toBe(true);

  // getItem itself can throw too.
  const blocked: CoachStorage = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  const both: CoachStorages = {
    local: () => blocked,
    session: () => session,
    memory: { done: false },
  };
  expect(loadCoachDone(both)).toBe(true);
});

test('both throw: memory, no exception', () => {
  const storages: CoachStorages = {
    local: throwing,
    session: throwing,
    memory: { done: false },
  };
  expect(loadCoachDone(storages)).toBe(false);
  expect(() => saveCoachDone(storages)).not.toThrow();
  expect(storages.memory.done).toBe(true);
  expect(loadCoachDone(storages)).toBe(true);
});
