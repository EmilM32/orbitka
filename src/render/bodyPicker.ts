import type { BodyScreenFrame } from '@core/bodyScreenFrame.ts';
import { pickBody } from '@core/hitTest.ts';
import type { Selection } from '@core/selection.ts';

import type { CameraPointerInput } from './cameraPointerInput.ts';

export type PickerSurface = {
  style: { cursor: string };
  getBoundingClientRect(): { left: number; top: number };
  addEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: boolean | EventListenerOptions,
  ): void;
};

export type BodyPicker = {
  dispose(): void;
};

export type BodyPickerOptions = {
  surface: PickerSurface;
  frame: BodyScreenFrame;
  selection: Selection;
  pointerInput: CameraPointerInput;
};

/**
 * Hover and tap selection. The canvas rect is read when a hover starts,
 * not on every pointer move.
 */
export function createBodyPicker(options: BodyPickerOptions): BodyPicker {
  const surface = options.surface;
  const frame = options.frame;
  const selection = options.selection;
  let disposed = false;
  let originReady = false;
  let originX = 0;
  let originY = 0;
  let pointX = 0;
  let pointY = 0;

  const unsubscribeTap = options.pointerInput.onTap(onTap);
  surface.addEventListener('pointermove', onPointerMove);
  surface.addEventListener('pointerleave', onPointerLeave);

  return {
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      unsubscribeTap();
      surface.removeEventListener('pointermove', onPointerMove);
      surface.removeEventListener('pointerleave', onPointerLeave);
    },
  };

  function onTap(xCss: number, yCss: number, pointerType: string): void {
    if (disposed || !Number.isFinite(xCss) || !Number.isFinite(yCss)) {
      return;
    }
    const id = pickBody(frame, xCss, yCss, pointerType);
    if (id !== null) {
      selection.select(id);
    }
  }

  function onPointerMove(event: Event): void {
    if (disposed || !readPoint(event)) {
      return;
    }

    const pointerType = stringField(event, 'pointerType');
    const buttons = numberField(event, 'buttons');
    const hovering =
      buttons === 0 && (pointerType === 'mouse' || pointerType === 'pen');
    if (!hovering) {
      clearHover();
      return;
    }

    const id = pickBody(frame, pointX, pointY, pointerType);
    selection.setHovered(id);
    surface.style.cursor = id === null ? '' : 'pointer';
  }

  function onPointerLeave(): void {
    if (disposed) {
      return;
    }
    originReady = false;
    clearHover();
  }

  function clearHover(): void {
    selection.setHovered(null);
    surface.style.cursor = '';
  }

  function readPoint(event: Event): boolean {
    const clientX = numberField(event, 'clientX');
    const clientY = numberField(event, 'clientY');
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return false;
    }
    if (!originReady) {
      const rect = surface.getBoundingClientRect();
      originX = rect.left;
      originY = rect.top;
      originReady = true;
    }
    pointX = clientX - originX;
    pointY = clientY - originY;
    return true;
  }
}

function numberField(event: Event, name: string): number {
  const value = (event as unknown as Record<string, unknown>)[name];
  return typeof value === 'number' ? value : Number.NaN;
}

function stringField(event: Event, name: string): string {
  const value = (event as unknown as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : '';
}
