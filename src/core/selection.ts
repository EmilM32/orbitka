export type SelectionEvent =
  | { kind: 'selected'; id: string; previousId: string | null }
  | { kind: 'system'; previousId: string | null }
  | { kind: 'hover'; id: string | null };

export type SelectionListener = (event: SelectionEvent) => void;

export type Selection = {
  select(id: string): void;
  showSystem(): void;
  setHovered(id: string | null): void;
  getSelectedId(): string | null;
  getHoveredId(): string | null;
  subscribe(listener: SelectionListener): () => void;
  dispose(): void;
};

type CommandKind = 'select' | 'system' | 'hover';

type CommandSlot = {
  kind: CommandKind;
  id: string | null;
};

const QUEUE_CAPACITY = 32;

export function createSelection(ids: readonly string[]): Selection {
  if (ids.length === 0) {
    throw new RangeError(
      'createSelection: parameter "ids" must contain at least one id, got 0',
    );
  }

  const allowed = new Set<string>();
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (id !== undefined) {
      allowed.add(id);
    }
  }

  const listeners: SelectionListener[] = [];
  const queue: CommandSlot[] = [];
  for (let index = 0; index < QUEUE_CAPACITY; index += 1) {
    queue.push({ kind: 'select', id: null });
  }

  let selectedId: string | null = null;
  let hoveredId: string | null = null;
  let head = 0;
  let count = 0;
  let emitting = false;
  let disposed = false;

  return {
    select(id: string): void {
      if (disposed) {
        return;
      }
      requireKnownId('select', allowed, id);
      enqueue('select', id);
    },
    showSystem(): void {
      if (disposed) {
        return;
      }
      enqueue('system', null);
    },
    setHovered(id: string | null): void {
      if (disposed) {
        return;
      }
      if (id !== null) {
        requireKnownId('setHovered', allowed, id);
      }
      enqueue('hover', id);
    },
    getSelectedId(): string | null {
      return selectedId;
    },
    getHoveredId(): string | null {
      return hoveredId;
    },
    subscribe(listener: SelectionListener): () => void {
      if (disposed) {
        return () => undefined;
      }
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      listeners.length = 0;
      count = 0;
      head = 0;
    },
  };

  function enqueue(kind: CommandKind, id: string | null): void {
    if (count >= QUEUE_CAPACITY) {
      throw new RangeError(
        `createSelection: parameter "queue" must have room for another command, got ${QUEUE_CAPACITY}`,
      );
    }

    const slot = queue[(head + count) % QUEUE_CAPACITY];
    if (slot === undefined) {
      return;
    }
    slot.kind = kind;
    slot.id = id;
    count += 1;
    if (!emitting) {
      drain();
    }
  }

  function drain(): void {
    emitting = true;
    try {
      while (count > 0 && !disposed) {
        const slot = queue[head];
        if (slot === undefined) {
          break;
        }
        const kind = slot.kind;
        const id = slot.id;
        head = (head + 1) % QUEUE_CAPACITY;
        count -= 1;
        apply(kind, id);
      }
    } finally {
      emitting = false;
    }
  }

  function apply(kind: CommandKind, id: string | null): void {
    if (kind === 'select') {
      if (id === null || id === selectedId) {
        return;
      }
      const previousId = selectedId;
      selectedId = id;
      emit({ kind: 'selected', id, previousId });
      return;
    }

    if (kind === 'system') {
      const previousId = selectedId;
      selectedId = null;
      emit({ kind: 'system', previousId });
      return;
    }

    if (id === hoveredId) {
      return;
    }
    hoveredId = id;
    emit({ kind: 'hover', id });
  }

  function emit(event: SelectionEvent): void {
    const snapshot = listeners.slice();
    for (let index = 0; index < snapshot.length; index += 1) {
      snapshot[index]?.(event);
    }
  }
}

function requireKnownId(
  functionName: string,
  allowed: ReadonlySet<string>,
  id: string,
): void {
  if (!allowed.has(id)) {
    throw new RangeError(
      `${functionName}: parameter "id" must be one of the selectable body ids, got "${id}"`,
    );
  }
}
