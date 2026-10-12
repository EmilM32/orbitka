import { VIEW_CONFIG } from '@core/viewConfig.ts';

export type GravityStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Only the exact string `true` shows the grid. Anything else, including errors, hides it. */
export function loadGravityVisible(storage: GravityStorage | null): boolean {
  if (storage === null) {
    return false;
  }

  try {
    return storage.getItem(VIEW_CONFIG.gravityStorageKey) === 'true';
  } catch {
    // A blocked read is the same as a missing preference.
    return false;
  }
}

export function saveGravityVisible(
  storage: GravityStorage | null,
  visible: boolean,
): void {
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(VIEW_CONFIG.gravityStorageKey, visible ? 'true' : 'false');
  } catch {
    // The in-memory button state still changes. A private window may reject writes.
  }
}
