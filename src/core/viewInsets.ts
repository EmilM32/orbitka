// How much of the window the body card or the bottom sheet covers, in CSS px
// (ADR-009 annex, EMI-219). The card writes it; the render layer moves the
// camera frame so the selected body stays in the middle of the free area.

export type ViewInsets = { right: number; bottom: number };

export type ViewInsetsStore = {
  get(): Readonly<ViewInsets>;
  set(insets: ViewInsets): void;
  subscribe(listener: (insets: Readonly<ViewInsets>) => void): () => void;
};

function requireInset(name: 'right' | 'bottom', value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `viewInsets.set: parameter "insets.${name}" must be finite and >= 0, got ${String(value)}`,
    );
  }
}

export function createViewInsets(): ViewInsetsStore {
  const current: ViewInsets = { right: 0, bottom: 0 };
  const listeners: Array<(insets: Readonly<ViewInsets>) => void> = [];

  return {
    get() {
      return current;
    },
    set(insets) {
      requireInset('right', insets.right);
      requireInset('bottom', insets.bottom);
      if (insets.right === current.right && insets.bottom === current.bottom) {
        return;
      }
      current.right = insets.right;
      current.bottom = insets.bottom;
      // Every listener runs even if one throws; the first error is rethrown.
      const snapshot = listeners.slice();
      let failure: { error: unknown } | null = null;
      for (const listener of snapshot) {
        try {
          listener(current);
        } catch (error) {
          failure ??= { error };
        }
      }
      if (failure !== null) {
        throw failure.error;
      }
    },
    subscribe(listener) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    },
  };
}
