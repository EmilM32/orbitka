export function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Reading localStorage can throw (private mode). State then stays in memory.
    return null;
  }
}
