// "Trening pilota" runs once (SPEC §5.10). The flag lives in localStorage;
// when that throws (a private window) sessionStorage keeps it for the
// session, and when both throw an in-memory flag keeps it for the page load.

export const COACH_STORAGE_KEY = 'orbitka.coach.done';
const DONE = '1';

export type CoachStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Getters, because reading `window.localStorage` itself can throw. */
export type CoachStorages = {
  local(): CoachStorage;
  session(): CoachStorage;
  memory: { done: boolean };
};

export function loadCoachDone(storage: CoachStorages): boolean {
  if (storage.memory.done) {
    return true;
  }
  for (const source of [storage.local, storage.session]) {
    try {
      return source().getItem(COACH_STORAGE_KEY) === DONE;
    } catch {
      // Blocked: try the next place.
    }
  }
  return false;
}

export function saveCoachDone(storage: CoachStorages): void {
  storage.memory.done = true;
  for (const source of [storage.local, storage.session]) {
    try {
      source().setItem(COACH_STORAGE_KEY, DONE);
      return;
    } catch {
      // Blocked: try the next place; memory already holds the flag.
    }
  }
}
