import { createAppStorage, type AppStorage } from '@core/storage.ts';

// The only place that names the browser storages. Everything else gets an
// `AppStorage` as a parameter (EMI-245).

export function localStore(): AppStorage {
  return createAppStorage(() => window.localStorage);
}

/** Second place for the one-time training flag when localStorage is blocked. */
export function sessionStore(): AppStorage {
  return createAppStorage(() => window.sessionStorage);
}
