/** Enough of `MediaQueryList` for the reduced-motion query. No globals. */
export type MediaQueryListLike = {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
};

export type MatchMedia = (query: string) => MediaQueryListLike;

export type ReducedMotion = {
  readonly matches: boolean;
  subscribe(listener: () => void): () => void;
  dispose(): void;
};

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function createReducedMotion(matchMedia: MatchMedia): ReducedMotion {
  const query = matchMedia(REDUCED_MOTION_QUERY);
  const listeners: Array<() => void> = [];
  let disposed = false;

  const onChange = (): void => {
    if (disposed) {
      return;
    }

    for (let index = 0; index < listeners.length; index += 1) {
      listeners[index]?.();
    }
  };

  query.addEventListener('change', onChange);

  return {
    get matches() {
      return query.matches;
    },
    subscribe(listener: () => void) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    },
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      query.removeEventListener('change', onChange);
      listeners.length = 0;
    },
  };
}
