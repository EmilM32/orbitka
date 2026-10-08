import './selectionRing.css';

import type { BodyScreenFrame } from '@core/bodyScreenFrame.ts';
import type { Selection, SelectionEvent } from '@core/selection.ts';
import { VIEW_CONFIG } from '@core/viewConfig.ts';

const CONTENT_INTERVAL_SECONDS = 0.1;

export type SelectionRing = {
  element: HTMLElement;
  update(dtSeconds: number): void;
  dispose(): void;
};

export function createSelectionRing(
  parent: HTMLElement,
  options: { selection: Selection; frame: BodyScreenFrame },
): SelectionRing {
  const frame = options.frame;
  const element = document.createElement('div');
  element.id = 'selection-ring';
  element.style.position = 'fixed';
  element.style.top = '0';
  element.style.left = '0';
  element.style.boxSizing = 'border-box';
  element.style.border = '1.5px solid rgba(255, 194, 75, 0.75)';
  element.style.borderRadius = '50%';
  element.style.pointerEvents = 'none';
  element.setAttribute('aria-hidden', 'true');
  element.hidden = true;
  parent.append(element);

  let selectedId: string | null = options.selection.getSelectedId();
  let disposed = false;
  let contentSeconds = 0;
  let placed = false;
  let lastHidden = true;
  let lastAria = 'true';
  let lastTransform = '';
  let lastWidth = '';
  let lastHeight = '';

  const unsubscribe = options.selection.subscribe(onSelection);

  return {
    element,
    update(dtSeconds: number): void {
      if (disposed) {
        return;
      }

      contentSeconds += dtSeconds;
      const index = findIndex(frame, selectedId);
      const show = index >= 0 && frame.visible[index] !== 0;
      if (index >= 0) {
        writeBox(
          frame.x[index] ?? 0,
          frame.y[index] ?? 0,
          frame.radiusPx[index] ?? 0,
        );
      }

      if (contentSeconds < CONTENT_INTERVAL_SECONDS) {
        return;
      }
      contentSeconds -= CONTENT_INTERVAL_SECONDS;
      writeVisibility(show);
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      unsubscribe();
      element.remove();
    },
  };

  function onSelection(event: SelectionEvent): void {
    if (disposed) {
      return;
    }
    if (event.kind === 'selected') {
      selectedId = event.id;
      return;
    }
    if (event.kind === 'system') {
      selectedId = null;
    }
  }

  function writeBox(x: number, y: number, radiusPx: number): void {
    const radius = Math.max(
      radiusPx + VIEW_CONFIG.selectionRingPaddingPx,
      VIEW_CONFIG.selectionRingMinRadiusPx,
    );
    const size = roundTenth(radius * 2);
    const transform =
      `translate(${roundTenth(x - radius)}px, ` +
      `${roundTenth(y - radius)}px)`;
    const width = `${size}px`;
    const height = `${size}px`;
    if (!placed || transform !== lastTransform) {
      element.style.transform = transform;
      lastTransform = transform;
    }
    if (!placed || width !== lastWidth) {
      element.style.width = width;
      lastWidth = width;
    }
    if (!placed || height !== lastHeight) {
      element.style.height = height;
      lastHeight = height;
    }
    placed = true;
  }

  function writeVisibility(show: boolean): void {
    if (lastHidden === !show && lastAria === 'true') {
      return;
    }
    element.hidden = !show;
    element.setAttribute('aria-hidden', 'true');
    lastHidden = !show;
    lastAria = 'true';
  }
}

function findIndex(frame: BodyScreenFrame, id: string | null): number {
  if (id === null) {
    return -1;
  }
  for (let index = 0; index < frame.count; index += 1) {
    if (frame.ids[index] === id) {
      return index;
    }
  }
  return -1;
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
