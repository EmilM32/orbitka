import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import {
  classifyWheel,
  createWheelGestureState,
  dragToRotation,
  isTap,
  wheelZoomFactor,
  type RotationDelta,
  type WheelGestureState,
  type WheelSample,
} from '@core/pointerGestures.ts';

import type { CameraController } from './cameraController.ts';

export type TapListener = (
  xCss: number,
  yCss: number,
  pointerType: string,
) => void;

export type CameraPointerInput = {
  onTap(listener: TapListener): () => void;
  dispose(): void;
};

/** Structural surface so tests can use an `EventTarget` instead of a canvas. */
export type CameraPointerSurface = {
  clientHeight: number;
  getBoundingClientRect(): { left: number; top: number };
  setPointerCapture(pointerId: number): void;
  releasePointerCapture(pointerId: number): void;
  hasPointerCapture?(pointerId: number): boolean;
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

export type CameraPointerController = Pick<
  CameraController,
  'rotateBy' | 'zoomBy' | 'notifyUserInput'
>;

export type CameraPointerInputOptions = {
  surface: CameraPointerSurface;
  controller: CameraPointerController;
};

type PointerSlot = {
  active: boolean;
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  downTime: number;
  pointerType: string;
  dragging: boolean;
};

type PointerFields = {
  pointerId: number;
  clientX: number;
  clientY: number;
  button: number;
  pointerType: string;
  timeStamp: number;
};

type WheelFields = {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  timeStamp: number;
};

const WHEEL_OPTIONS: AddEventListenerOptions = { passive: false };

export function createCameraPointerInput(
  options: CameraPointerInputOptions,
): CameraPointerInput {
  const surface = options.surface;
  const controller = options.controller;
  const slotA = createSlot();
  const slotB = createSlot();
  const sample: WheelSample = {
    deltaX: 0,
    deltaY: 0,
    deltaMode: 0,
    ctrlKey: false,
  };
  const rotation: RotationDelta = { dAzimuth: 0, dPolar: 0 };
  const wheelState: WheelGestureState = createWheelGestureState();
  const tapListeners: TapListener[] = [];
  let disposed = false;
  let sawTwoPointers = false;
  let lastSpan = 0;

  surface.addEventListener('pointerdown', onPointerDown);
  surface.addEventListener('pointermove', onPointerMove);
  surface.addEventListener('pointerup', onPointerUp);
  surface.addEventListener('pointercancel', onPointerCancel);
  surface.addEventListener('lostpointercapture', onLostPointerCapture);
  surface.addEventListener('wheel', onWheel, WHEEL_OPTIONS);

  return {
    onTap(listener: TapListener): () => void {
      if (disposed) {
        return () => undefined;
      }

      tapListeners.push(listener);
      return () => {
        const index = tapListeners.indexOf(listener);
        if (index >= 0) {
          tapListeners.splice(index, 1);
        }
      };
    },
    dispose(): void {
      if (disposed) {
        return;
      }

      disposed = true;
      surface.removeEventListener('pointerdown', onPointerDown);
      surface.removeEventListener('pointermove', onPointerMove);
      surface.removeEventListener('pointerup', onPointerUp);
      surface.removeEventListener('pointercancel', onPointerCancel);
      surface.removeEventListener('lostpointercapture', onLostPointerCapture);
      surface.removeEventListener('wheel', onWheel);
      slotA.active = false;
      slotB.active = false;
      tapListeners.length = 0;
    },
  };

  function onPointerDown(event: Event): void {
    if (disposed) {
      return;
    }

    const pointer = asPointer(event);
    if (!Number.isFinite(pointer.pointerId)) {
      return;
    }
    if (
      !Number.isFinite(pointer.clientX) ||
      !Number.isFinite(pointer.clientY)
    ) {
      return;
    }
    if (pointer.pointerType === 'mouse' && pointer.button !== 0) {
      return;
    }
    if (slotFor(pointer.pointerId) !== null) {
      return;
    }

    const slot = emptySlot();
    if (slot === null) {
      return;
    }

    slot.active = true;
    slot.id = pointer.pointerId;
    slot.x = pointer.clientX;
    slot.y = pointer.clientY;
    slot.startX = pointer.clientX;
    slot.startY = pointer.clientY;
    slot.lastX = pointer.clientX;
    slot.lastY = pointer.clientY;
    slot.downTime = Number.isFinite(pointer.timeStamp) ? pointer.timeStamp : 0;
    slot.pointerType =
      typeof pointer.pointerType === 'string' ? pointer.pointerType : '';
    slot.dragging = false;
    if (slotA.active && slotB.active) {
      sawTwoPointers = true;
      lastSpan = currentSpan();
      // A second finger is user input on its own: it ends a flight even
      // before the fingers move. The pinch that follows does not notify again.
      controller.notifyUserInput();
    }
    surface.setPointerCapture(pointer.pointerId);
  }

  function onPointerMove(event: Event): void {
    if (disposed) {
      return;
    }

    const pointer = asPointer(event);
    if (
      !Number.isFinite(pointer.pointerId) ||
      !Number.isFinite(pointer.clientX) ||
      !Number.isFinite(pointer.clientY)
    ) {
      return;
    }

    const slot = slotFor(pointer.pointerId);
    if (slot === null) {
      return;
    }

    slot.x = pointer.clientX;
    slot.y = pointer.clientY;
    if (slotA.active && slotB.active) {
      applyPinch();
      return;
    }
    applyDrag(slot);
  }

  function onPointerUp(event: Event): void {
    endPointer(event, true, true);
  }

  function onPointerCancel(event: Event): void {
    endPointer(event, false, true);
  }

  function onLostPointerCapture(event: Event): void {
    endPointer(event, false, false);
  }

  function onWheel(event: Event): void {
    if (disposed) {
      return;
    }

    const wheel = asWheel(event);
    if (
      !Number.isFinite(wheel.deltaX) ||
      !Number.isFinite(wheel.deltaY) ||
      !Number.isFinite(wheel.deltaMode) ||
      !Number.isFinite(wheel.timeStamp)
    ) {
      return;
    }

    event.preventDefault();
    if (wheel.deltaX === 0 && wheel.deltaY === 0) {
      return;
    }

    sample.deltaX = wheel.deltaX;
    sample.deltaY = wheel.deltaY;
    sample.deltaMode = wheel.deltaMode;
    sample.ctrlKey = wheel.ctrlKey === true;
    const kind = classifyWheel(wheelState, sample, wheel.timeStamp);
    if (kind === 'trackpad') {
      rotateByPixels(-sample.deltaX, -sample.deltaY);
    } else if (kind === 'notch' || kind === 'pinch') {
      const factor = wheelZoomFactor(kind, sample);
      if (factor !== 1) {
        controller.zoomBy(factor, true, false);
      }
    }
    controller.notifyUserInput();
  }

  function endPointer(event: Event, allowTap: boolean, release: boolean): void {
    if (disposed) {
      return;
    }

    const pointer = asPointer(event);
    if (!Number.isFinite(pointer.pointerId)) {
      return;
    }

    const slot = slotFor(pointer.pointerId);
    if (slot === null) {
      return;
    }
    if (Number.isFinite(pointer.clientX) && Number.isFinite(pointer.clientY)) {
      slot.x = pointer.clientX;
      slot.y = pointer.clientY;
    }

    const x = slot.x;
    const y = slot.y;
    const startX = slot.startX;
    const startY = slot.startY;
    const downTime = slot.downTime;
    const pointerType = slot.pointerType;
    const dragging = slot.dragging;
    const other = slot === slotA ? slotB : slotA;
    const wasPinch = other.active;
    const suppressTap = !allowTap || wasPinch || sawTwoPointers || dragging;
    const upTime = pointer.timeStamp;
    const pointerId = slot.id;

    // Clear before release. A synchronous lostpointercapture must not drop the tap.
    slot.active = false;
    if (wasPinch) {
      other.startX = other.x;
      other.startY = other.y;
      other.lastX = other.x;
      other.lastY = other.y;
      other.dragging = false;
    }
    if (!other.active) {
      sawTwoPointers = false;
      lastSpan = 0;
    }
    if (release) {
      releaseCapture(pointerId);
    }
    if (
      suppressTap ||
      !Number.isFinite(upTime) ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      return;
    }

    const move = Math.hypot(x - startX, y - startY);
    const duration = upTime - downTime;
    if (!Number.isFinite(move) || !Number.isFinite(duration)) {
      return;
    }
    if (!isTap(move, duration)) {
      return;
    }

    const rect = surface.getBoundingClientRect();
    emitTap(x - rect.left, y - rect.top, pointerType);
  }

  function applyDrag(slot: PointerSlot): void {
    const height = surface.clientHeight;
    if (!Number.isFinite(height) || height <= 0) {
      return;
    }

    if (!slot.dragging) {
      const movedX = slot.x - slot.startX;
      const movedY = slot.y - slot.startY;
      if (Math.hypot(movedX, movedY) < CAMERA_CONFIG.tapMaxMovePx) {
        return;
      }

      dragToRotation(rotation, movedX, movedY, height);
      controller.rotateBy(rotation.dAzimuth, rotation.dPolar, true, false);
      slot.dragging = true;
      slot.lastX = slot.x;
      slot.lastY = slot.y;
      controller.notifyUserInput();
      return;
    }

    const dx = slot.x - slot.lastX;
    const dy = slot.y - slot.lastY;
    slot.lastX = slot.x;
    slot.lastY = slot.y;
    if (dx === 0 && dy === 0) {
      return;
    }

    dragToRotation(rotation, dx, dy, height);
    controller.rotateBy(rotation.dAzimuth, rotation.dPolar, true, false);
  }

  function applyPinch(): void {
    const span = currentSpan();
    if (!(span > 0)) {
      return;
    }
    if (!(lastSpan > 0)) {
      lastSpan = span;
      return;
    }

    const factor = lastSpan / span;
    lastSpan = span;
    if (factor === 1) {
      return;
    }

    controller.zoomBy(factor, true, false);
  }

  function rotateByPixels(dx: number, dy: number): void {
    const height = surface.clientHeight;
    if (!Number.isFinite(height) || height <= 0) {
      return;
    }
    if (dx === 0 && dy === 0) {
      return;
    }

    dragToRotation(rotation, dx, dy, height);
    controller.rotateBy(rotation.dAzimuth, rotation.dPolar, true, false);
  }

  function currentSpan(): number {
    return Math.hypot(slotA.x - slotB.x, slotA.y - slotB.y);
  }

  function slotFor(pointerId: number): PointerSlot | null {
    if (slotA.active && slotA.id === pointerId) {
      return slotA;
    }
    if (slotB.active && slotB.id === pointerId) {
      return slotB;
    }
    return null;
  }

  function emptySlot(): PointerSlot | null {
    if (!slotA.active) {
      return slotA;
    }
    if (!slotB.active) {
      return slotB;
    }
    return null;
  }

  function releaseCapture(pointerId: number): void {
    if (
      surface.hasPointerCapture !== undefined &&
      !surface.hasPointerCapture(pointerId)
    ) {
      return;
    }
    surface.releasePointerCapture(pointerId);
  }

  function emitTap(xCss: number, yCss: number, pointerType: string): void {
    for (let index = 0; index < tapListeners.length; index += 1) {
      tapListeners[index]?.(xCss, yCss, pointerType);
    }
  }
}

function createSlot(): PointerSlot {
  return {
    active: false,
    id: 0,
    x: 0,
    y: 0,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    downTime: 0,
    pointerType: '',
    dragging: false,
  };
}

function asPointer(event: Event): PointerFields {
  return event as Event & PointerFields;
}

function asWheel(event: Event): WheelFields {
  return event as Event & WheelFields;
}
