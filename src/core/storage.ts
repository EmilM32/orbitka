// Persistent browser storage behind one module (EMI-245). Every stored value
// lives under `orbitka.v1.<name>`; nothing else in `src` touches the raw
// storage. No DOM and no globals: the app injects the storage, like the clock
// gets its time source. No personal data is stored (SPEC §7).

import { parseQualityLevel } from './quality.ts';

export const STORAGE_PREFIX = 'orbitka.v1.';

/** The part of `Storage` the module needs. */
export type RawStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * The same three methods as `Storage`, but keyed by the short name of a known
 * entry (`coach.done`) and validating what it reads. Like `Storage` itself it
 * throws when the browser blocks the storage (private mode), so callers keep
 * their fallbacks.
 */
export type AppStorage = RawStorage;

type Entry = {
  /** Key used before versioning; read once by the migration, then removed. */
  legacyKey?: string;
  isValid(value: string): boolean;
};

const ENTRIES: Readonly<Record<string, Entry>> = {
  'coach.done': {
    legacyKey: 'orbitka.coach.done',
    isValid: (value) => value === '1',
  },
  orbits: {
    legacyKey: 'orbitka.orbits',
    isValid: (value) => value === 'true' || value === 'false',
  },
  'quality.auto': {
    legacyKey: 'orbitka.quality.auto',
    isValid: (value) => parseQualityLevel(value) !== null,
  },
  // The intro has played in this session (kept in the session storage).
  'intro.done': {
    isValid: (value) => value === '1',
  },
  'quality.override': {
    legacyKey: 'orbitka.quality.override',
    isValid: (value) => parseQualityLevel(value) !== null,
  },
};

export const STORAGE_NAMES = Object.keys(ENTRIES);

function entryFor(name: string): Entry {
  const entry = ENTRIES[name];
  if (entry === undefined) {
    throw new RangeError(
      `storage: unknown entry "${name}", expected one of ${STORAGE_NAMES.join(', ')}`,
    );
  }

  return entry;
}

/**
 * Moves values saved under the old unversioned keys to `orbitka.v1.*` and
 * deletes the old keys. A value that does not validate is dropped. A value
 * already present under the new key wins over the old one.
 */
export function migrateLegacyKeys(raw: RawStorage): void {
  for (const [name, entry] of Object.entries(ENTRIES)) {
    if (entry.legacyKey === undefined) {
      continue;
    }
    const legacy = raw.getItem(entry.legacyKey);
    if (legacy === null) {
      continue;
    }

    const key = `${STORAGE_PREFIX}${name}`;
    if (raw.getItem(key) === null && entry.isValid(legacy)) {
      raw.setItem(key, legacy);
    }
    raw.removeItem(entry.legacyKey);
  }
}

/**
 * `source` is a getter, because reading `window.localStorage` itself can
 * throw; `null` means no storage. The migration runs on the first use that
 * finds a working storage.
 */
export function createAppStorage(source: () => RawStorage | null): AppStorage {
  let migrated = false;

  function raw(): RawStorage {
    const storage = source();
    if (storage === null) {
      throw new Error('storage: no storage available');
    }

    if (!migrated) {
      migrateLegacyKeys(storage);
      migrated = true;
    }

    return storage;
  }

  return {
    getItem(name) {
      const entry = entryFor(name);
      const value = raw().getItem(`${STORAGE_PREFIX}${name}`);
      return value !== null && entry.isValid(value) ? value : null;
    },
    setItem(name, value) {
      const entry = entryFor(name);
      if (!entry.isValid(value)) {
        throw new RangeError(
          `storage: invalid value for "${name}", got "${value}"`,
        );
      }

      raw().setItem(`${STORAGE_PREFIX}${name}`, value);
    },
    removeItem(name) {
      entryFor(name);
      raw().removeItem(`${STORAGE_PREFIX}${name}`);
    },
  };
}
