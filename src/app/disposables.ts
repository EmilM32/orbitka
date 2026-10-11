export type Disposables = {
  add(dispose: () => void): void;
  /** Runs every added callback, the last one added first. */
  disposeAll(): void;
};

/** A stack of cleanups: dispose order is the reverse of creation order. */
export function createDisposables(): Disposables {
  const pending: Array<() => void> = [];

  return {
    add(dispose) {
      pending.push(dispose);
    },
    disposeAll() {
      for (let next = pending.pop(); next; next = pending.pop()) {
        next();
      }
    },
  };
}
