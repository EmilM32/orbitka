/**
 * Screen rectangles of the UI panels that scene labels must stay off
 * (EMI-234). Rects are read only on events (resize, a panel shown, hidden
 * or finishing a transition), never per frame, so the label layout reads
 * plain numbers.
 */
export type LabelObstacles = {
  /** left, top, right, bottom per panel, CSS px; `count()` entries valid. */
  readonly rects: Float64Array;
  count(): number;
  refresh(): void;
  dispose(): void;
};

type ObserverLike = {
  observe(target: Element, options?: object): void;
  disconnect(): void;
};

export type LabelObstaclesOptions = {
  /** Panels to avoid; missing (null) entries are skipped. Read on refresh. */
  elements: () => readonly (Element | null | undefined)[];
  /** Where panels come and go (childList) and transitions end. */
  root: HTMLElement;
  capacity?: number;
  createResizeObserver?: (callback: () => void) => ObserverLike;
  createMutationObserver?: (callback: () => void) => ObserverLike;
};

const DEFAULT_CAPACITY = 16;

function defaultResizeObserver(callback: () => void): ObserverLike | null {
  return typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(() => {
        callback();
      });
}

function defaultMutationObserver(callback: () => void): ObserverLike | null {
  return typeof MutationObserver === 'undefined'
    ? null
    : new MutationObserver(() => {
        callback();
      });
}

function isDrawn(element: Element): boolean {
  if (element instanceof HTMLElement && element.hidden) {
    return false;
  }
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

export function createLabelObstacles(
  options: LabelObstaclesOptions,
): LabelObstacles {
  const capacity = options.capacity ?? DEFAULT_CAPACITY;
  const rects = new Float64Array(capacity * 4);
  let used = 0;
  let disposed = false;
  let observed: Element[] = [];

  const resize =
    options.createResizeObserver?.(refresh) ?? defaultResizeObserver(refresh);
  const mutation =
    options.createMutationObserver?.(onMutation) ??
    defaultMutationObserver(onMutation);

  const onTransitionEnd = (event: Event): void => {
    const target = event.target;
    if (target instanceof Element && observed.includes(target)) {
      refresh();
    }
  };
  options.root.addEventListener('transitionend', onTransitionEnd, true);
  options.root.addEventListener('animationend', onTransitionEnd, true);
  window.addEventListener('resize', refresh);
  refresh();

  return {
    rects,
    count: () => used,
    refresh,
    dispose,
  };

  function onMutation(): void {
    refresh();
  }

  function observeAll(elements: Element[]): void {
    resize?.disconnect();
    mutation?.disconnect();
    mutation?.observe(options.root, { childList: true });
    for (const element of elements) {
      resize?.observe(element);
      mutation?.observe(element, {
        attributes: true,
        attributeFilter: ['hidden', 'class', 'data-mode', 'aria-expanded'],
      });
    }
    observed = elements;
  }

  function refresh(): void {
    if (disposed) {
      return;
    }
    const elements: Element[] = [];
    for (const element of options.elements()) {
      if (element !== null && element !== undefined && element.isConnected) {
        elements.push(element);
      }
    }
    if (
      elements.length !== observed.length ||
      elements.some((element, index) => element !== observed[index])
    ) {
      observeAll(elements);
    }

    used = 0;
    for (const element of elements) {
      if (used >= capacity || !isDrawn(element)) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if (!(rect.width > 0) || !(rect.height > 0)) {
        continue;
      }
      const base = used * 4;
      rects[base] = rect.left;
      rects[base + 1] = rect.top;
      rects[base + 2] = rect.right;
      rects[base + 3] = rect.bottom;
      used += 1;
    }
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    resize?.disconnect();
    mutation?.disconnect();
    options.root.removeEventListener('transitionend', onTransitionEnd, true);
    options.root.removeEventListener('animationend', onTransitionEnd, true);
    window.removeEventListener('resize', refresh);
    used = 0;
  }
}
