type HeightEntry = {
  contentRect: { height: number };
  borderBoxSize?: ReadonlyArray<{ blockSize: number }>;
};

export type LayoutHeightListener = (entries: readonly HeightEntry[]) => void;

export type LayoutObserverFactory = (callback: LayoutHeightListener) => {
  observe(target: Element): void;
  disconnect(): void;
};

export type LayoutObserverOptions = {
  target: HTMLElement;
  root: HTMLElement;
  createObserver?: LayoutObserverFactory;
};

export type LayoutObserver = {
  dispose(): void;
};

function entryHeight(entry: HeightEntry): number {
  const block = entry.borderBoxSize?.[0]?.blockSize;
  if (typeof block === 'number' && Number.isFinite(block)) {
    return block;
  }

  return entry.contentRect.height;
}

function defaultFactory(): LayoutObserverFactory | null {
  if (typeof ResizeObserver === 'undefined') {
    return null;
  }

  return (callback) => {
    const observer = new ResizeObserver((entries) => {
      const mapped: HeightEntry[] = [];
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
          continue;
        }
        mapped.push({
          contentRect: { height: entry.contentRect.height },
          borderBoxSize: entry.borderBoxSize,
        });
      }
      callback(mapped);
    });

    return observer;
  };
}

export function createLayoutObserver(
  options: LayoutObserverOptions,
): LayoutObserver {
  const { target, root } = options;
  const factory = options.createObserver ?? defaultFactory();
  let disposed = false;
  let observer: { disconnect(): void } | null = null;

  function publish(height: number): void {
    if (!Number.isFinite(height) || height < 0) {
      return;
    }

    root.style.setProperty('--time-panel-height', `${Math.ceil(height)}px`);
  }

  if (factory === null) {
    root.style.setProperty('--time-panel-height', '0px');
  } else {
    const created = factory((entries) => {
      if (disposed) {
        return;
      }
      const entry = entries[0];
      if (entry === undefined) {
        return;
      }
      publish(entryHeight(entry));
    });
    publish(target.getBoundingClientRect().height);
    created.observe(target);
    observer = created;
  }

  return {
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      observer?.disconnect();
      observer = null;
      root.style.removeProperty('--time-panel-height');
    },
  };
}
