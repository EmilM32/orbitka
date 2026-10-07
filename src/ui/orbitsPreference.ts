import { VIEW_CONFIG } from '@core/viewConfig.ts';

export type OrbitsStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Only the exact string `false` hides orbits. Anything else, including errors, shows them. */
export function loadOrbitsVisible(storage: OrbitsStorage | null): boolean {
  if (storage === null) {
    return true;
  }

  try {
    return storage.getItem(VIEW_CONFIG.orbitsStorageKey) !== 'false';
  } catch {
    // A blocked read is the same as a missing preference.
    return true;
  }
}

export function saveOrbitsVisible(
  storage: OrbitsStorage | null,
  visible: boolean,
): void {
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(VIEW_CONFIG.orbitsStorageKey, visible ? 'true' : 'false');
  } catch {
    // The in-memory button state still changes. A private window may reject writes.
  }
}
