import { PerspectiveCamera } from 'three';
import { expect, test, vi } from 'vitest';

import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import { startDistance, type CameraPose } from '@core/cameraMath.ts';
import {
  createCameraController,
  type CameraController,
} from '@render/cameraController.ts';
import {
  createCameraPointerInput,
  type CameraPointerInput,
  type TapListener,
} from '@render/cameraPointerInput.ts';

const alloc = vi.hoisted(() => ({ vector3: 0, spherical: 0 }));

vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');

  class CountingVector3 extends actual.Vector3 {
    constructor(...args: ConstructorParameters<typeof actual.Vector3>) {
      alloc.vector3 += 1;
      super(...args);
    }
  }

  class CountingSpherical extends actual.Spherical {
    constructor(...args: ConstructorParameters<typeof actual.Spherical>) {
      alloc.spherical += 1;
      super(...args);
    }
  }

  return {
    ...actual,
    Vector3: CountingVector3,
    Spherical: CountingSpherical,
  };
});

const ASPECT = 16 / 9;
const HEIGHT = 720;

type PointerInit = {
  pointerId?: number;
  clientX?: number;
  clientY?: number;
  button?: number;
  pointerType?: string;
  timeStamp?: number;
};

type WheelInit = {
  deltaX?: number;
  deltaY?: number;
  deltaMode?: number;
  ctrlKey?: boolean;
  timeStamp?: number;
};

class Surface extends EventTarget {
  clientHeight = HEIGHT;
  readonly rect = { left: 15, top: 25 };
  readonly style = { touchAction: '' };
  addCount = 0;
  removeCount = 0;
  rectReads = 0;
  private readonly capturedIds: number[] = [];

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    this.addCount += 1;
    super.addEventListener(type, listener, options);
  }

  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    this.removeCount += 1;
    super.removeEventListener(type, listener, options);
  }

  getBoundingClientRect(): { left: number; top: number } {
    this.rectReads += 1;
    return this.rect;
  }

  setPointerCapture(pointerId: number): void {
    this.capturedIds.push(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.capturedIds.includes(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    const index = this.capturedIds.indexOf(pointerId);
    if (index >= 0) {
      this.capturedIds.splice(index, 1);
    }
    const event = new Event('lostpointercapture');
    defineField(event, 'pointerId', pointerId);
    this.dispatchEvent(event);
  }
}

function defineField(event: Event, name: string, value: unknown): void {
  Object.defineProperty(event, name, {
    value,
    configurable: true,
    writable: true,
  });
}

function dispatch(
  surface: Surface,
  type: string,
  fields: Record<string, unknown>,
): Event {
  const event = new Event(type, { cancelable: true });
  const names = Object.keys(fields);
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    if (name !== undefined) {
      defineField(event, name, fields[name]);
    }
  }
  surface.dispatchEvent(event);
  return event;
}

function pointer(
  surface: Surface,
  type: string,
  fields: PointerInit = {},
): Event {
  return dispatch(surface, type, {
    pointerId: fields.pointerId ?? 1,
    clientX: fields.clientX ?? 0,
    clientY: fields.clientY ?? 0,
    button: fields.button ?? 0,
    pointerType: fields.pointerType ?? 'mouse',
    timeStamp: fields.timeStamp ?? 0,
  });
}

function wheel(surface: Surface, fields: WheelInit = {}): Event {
  return dispatch(surface, 'wheel', {
    deltaX: fields.deltaX ?? 0,
    deltaY: fields.deltaY ?? 0,
    deltaMode: fields.deltaMode ?? 0,
    ctrlKey: fields.ctrlKey ?? false,
    timeStamp: fields.timeStamp ?? 0,
  });
}

function setup(): {
  controller: CameraController;
  surface: Surface;
  input: CameraPointerInput;
  pose: CameraPose;
  read: () => CameraPose;
} {
  const camera = new PerspectiveCamera(45, ASPECT, 0.1, 2000);
  const controller = createCameraController({
    camera,
    reducedMotion: {
      matches: true,
      subscribe: () => () => undefined,
    },
  });
  const surface = new Surface();
  const input = createCameraPointerInput({ surface, controller });
  const pose: CameraPose = {
    azimuth: 0,
    polar: 0,
    distance: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  };
  return {
    controller,
    surface,
    input,
    pose,
    read: () => controller.getPose(pose),
  };
}

function rotationFor(
  dx: number,
  dy: number,
  height = HEIGHT,
): {
  dAzimuth: number;
  dPolar: number;
} {
  const scale = (-2 * Math.PI) / height;
  return { dAzimuth: scale * dx, dPolar: scale * dy };
}

test('mouse drag rotates', () => {
  const { surface, read } = setup();
  const start = read();
  const startPolar = start.polar;
  const startDistanceValue = start.distance;

  pointer(surface, 'pointerdown', { clientX: 0, clientY: 0 });
  pointer(surface, 'pointermove', { clientX: 100, clientY: 0 });

  const turned = rotationFor(100, 0);
  expect(read().azimuth).toBeCloseTo(turned.dAzimuth, 10);
  expect(read().polar).toBeCloseTo(startPolar, 10);
  expect(read().distance).toBe(startDistanceValue);
  expect(read().targetX).toBe(0);
  expect(read().targetY).toBe(0);
  expect(read().targetZ).toBe(0);
  expect(surface.rectReads).toBe(0);

  pointer(surface, 'pointermove', { clientX: 100, clientY: 50 });
  const lowered = rotationFor(0, 50);
  expect(read().azimuth).toBeCloseTo(turned.dAzimuth, 10);
  expect(read().polar).toBeCloseTo(startPolar + lowered.dPolar, 10);
  expect(lowered.dPolar).toBeLessThan(0);
});

test('right and middle button do nothing', () => {
  const { surface, controller, read } = setup();
  const startAzimuth = read().azimuth;
  const startPolar = read().polar;
  const startDistanceValue = read().distance;
  const state = controller.getState({
    azimuthDeg: 0,
    polarDeg: 0,
    distance: 0,
    distanceMin: 0,
    distanceMax: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  });

  for (const button of [1, 2]) {
    pointer(surface, 'pointerdown', { button, clientX: 0, clientY: 0 });
    pointer(surface, 'pointermove', { button, clientX: 180, clientY: 90 });
    pointer(surface, 'pointerup', { button, clientX: 180, clientY: 90 });
  }

  expect(read().azimuth).toBe(startAzimuth);
  expect(read().polar).toBe(startPolar);
  expect(read().distance).toBe(startDistanceValue);
  const after = controller.getState(state);
  expect(after.targetX).toBe(0);
  expect(after.targetY).toBe(0);
  expect(after.targetZ).toBe(0);
});

test('wheel notch zooms by 10 percent', () => {
  const { surface, read } = setup();
  const origin = read().distance;
  expect(origin).toBe(startDistance(ASPECT));

  wheel(surface, { deltaY: 100, timeStamp: 0 });
  expect(read().distance).toBeCloseTo(origin * CAMERA_CONFIG.zoomStepOut, 10);

  wheel(surface, { deltaY: -100, timeStamp: 20 });
  expect(read().distance).toBeCloseTo(
    origin * CAMERA_CONFIG.zoomStepOut * CAMERA_CONFIG.zoomStepIn,
    10,
  );

  const afterPixels = read().distance;
  wheel(surface, { deltaY: 3, deltaMode: 1, timeStamp: 40 });
  expect(read().distance).toBeCloseTo(
    afterPixels * CAMERA_CONFIG.zoomStepOut,
    10,
  );

  wheel(surface, { deltaY: -3, deltaMode: 1, timeStamp: 60 });
  expect(read().distance).toBeCloseTo(
    afterPixels * CAMERA_CONFIG.zoomStepOut * CAMERA_CONFIG.zoomStepIn,
    10,
  );
  expect(read().azimuth).toBeCloseTo(0, 10);
});

test('ctrl wheel pinches; trackpad scroll rotates', () => {
  const { surface, read } = setup();
  const origin = read().distance;
  const startPolar = read().polar;
  const deltaY = 20;

  wheel(surface, { deltaY, ctrlKey: true, timeStamp: 0 });
  expect(read().distance).toBeCloseTo(
    origin *
      CAMERA_CONFIG.zoomStepOut ** (deltaY / CAMERA_CONFIG.pinchDeltaPerStep),
    10,
  );

  const fresh = setup();
  const polar = fresh.read().polar;
  const distance = fresh.read().distance;
  const deltaX = 36;
  const scrollY = -18;
  wheel(fresh.surface, { deltaX, deltaY: scrollY, timeStamp: 0 });
  const turned = rotationFor(-deltaX, -scrollY);
  expect(fresh.read().azimuth).toBeCloseTo(turned.dAzimuth, 10);
  expect(fresh.read().polar).toBeCloseTo(polar + turned.dPolar, 10);
  expect(fresh.read().distance).toBe(distance);
  expect(fresh.read().targetX).toBe(0);
  expect(polar).toBeCloseTo(startPolar, 10);
});

test('wheel mode is held until a gap', () => {
  const { surface, read } = setup();
  const origin = read().distance;

  wheel(surface, { deltaX: 5, deltaY: 2.25, timeStamp: 1000 });
  expect(read().distance).toBe(origin);
  const afterScroll = read().polar;

  wheel(surface, { deltaX: 0, deltaY: 60, timeStamp: 1100 });
  expect(read().distance).toBe(origin);
  expect(read().polar).not.toBeCloseTo(afterScroll, 8);

  const polarBeforeNotch = read().polar;
  wheel(surface, {
    deltaX: 0,
    deltaY: 60,
    timeStamp: 1100 + CAMERA_CONFIG.wheelGestureGapMs,
  });
  expect(read().distance).toBeCloseTo(origin * CAMERA_CONFIG.zoomStepOut, 10);
  expect(read().polar).toBeCloseTo(polarBeforeNotch, 10);
});

test('one finger rotates, two finger pinch', () => {
  const { controller, surface, read } = setup();
  let userInputs = 0;
  controller.onUserInput(() => {
    userInputs += 1;
  });

  pointer(surface, 'pointerdown', {
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    pointerType: 'touch',
  });
  pointer(surface, 'pointermove', {
    pointerId: 1,
    clientX: 80,
    clientY: 0,
    pointerType: 'touch',
  });
  expect(read().azimuth).toBeCloseTo(rotationFor(80, 0).dAzimuth, 10);
  expect(userInputs).toBe(1);
  pointer(surface, 'pointerup', {
    pointerId: 1,
    clientX: 80,
    clientY: 0,
    pointerType: 'touch',
    timeStamp: 50,
  });

  const distance = read().distance;
  const azimuth = read().azimuth;
  const targetX = read().targetX;
  userInputs = 0;
  pointer(surface, 'pointerdown', {
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    pointerType: 'touch',
    timeStamp: 1000,
  });
  pointer(surface, 'pointerdown', {
    pointerId: 2,
    clientX: 0,
    clientY: 100,
    pointerType: 'touch',
    timeStamp: 1010,
  });
  expect(read().distance).toBe(distance);

  pointer(surface, 'pointermove', {
    pointerId: 2,
    clientX: 0,
    clientY: 250,
    pointerType: 'touch',
    timeStamp: 1020,
  });
  expect(read().distance).toBeCloseTo(distance * (100 / 250), 10);
  expect(read().azimuth).toBeCloseTo(azimuth, 10);
  expect(read().targetX).toBe(targetX);
  expect(read().targetY).toBe(0);
  expect(userInputs).toBe(1);

  pointer(surface, 'pointermove', {
    pointerId: 1,
    clientX: 40,
    clientY: 0,
    pointerType: 'touch',
    timeStamp: 1030,
  });
  pointer(surface, 'pointermove', {
    pointerId: 2,
    clientX: 40,
    clientY: 250,
    pointerType: 'touch',
    timeStamp: 1040,
  });
  expect(read().distance).toBeCloseTo(distance * (100 / 250), 10);
  expect(read().targetX).toBe(0);
  expect(read().azimuth).toBeCloseTo(azimuth, 10);
  expect(userInputs).toBe(1);
});

test('drag starts after 6 px and notifies user input once', () => {
  const { controller, surface, read } = setup();
  let userInputs = 0;
  controller.onUserInput(() => {
    userInputs += 1;
  });
  const startAzimuth = read().azimuth;
  const startPolar = read().polar;
  const startDistanceValue = read().distance;

  pointer(surface, 'pointerdown', { clientX: 0, clientY: 0, timeStamp: 0 });
  pointer(surface, 'pointermove', { clientX: 5.9, clientY: 0, timeStamp: 20 });
  expect(read().azimuth).toBe(startAzimuth);
  expect(read().polar).toBe(startPolar);
  expect(userInputs).toBe(0);

  pointer(surface, 'pointermove', { clientX: 6, clientY: 0, timeStamp: 30 });
  expect(read().azimuth).toBeCloseTo(rotationFor(6, 0).dAzimuth, 10);
  expect(userInputs).toBe(1);

  pointer(surface, 'pointermove', { clientX: 40, clientY: 0, timeStamp: 40 });
  expect(read().azimuth).toBeCloseTo(rotationFor(40, 0).dAzimuth, 10);
  expect(userInputs).toBe(1);
  expect(read().distance).toBe(startDistanceValue);

  wheel(surface, { deltaY: 100, timeStamp: 50 });
  expect(userInputs).toBe(2);
  wheel(surface, { deltaX: 4, deltaY: 1.5, timeStamp: 60 });
  expect(userInputs).toBe(3);
  wheel(surface, { deltaX: 0, deltaY: 0, timeStamp: 70 });
  expect(userInputs).toBe(3);
});

test('tap threshold', () => {
  const { controller, surface, input, read } = setup();
  const taps: Array<[number, number, string]> = [];
  const onTap: TapListener = (xCss, yCss, pointerType) => {
    taps.push([xCss, yCss, pointerType]);
  };
  input.onTap(onTap);
  let userInputs = 0;
  controller.onUserInput(() => {
    userInputs += 1;
  });

  pointer(surface, 'pointerdown', {
    clientX: 100,
    clientY: 200,
    pointerType: 'pen',
    timeStamp: 1000,
  });
  pointer(surface, 'pointermove', {
    clientX: 105.9,
    clientY: 200,
    pointerType: 'pen',
    timeStamp: 1100,
  });
  pointer(surface, 'pointerup', {
    clientX: 105.9,
    clientY: 200,
    pointerType: 'pen',
    timeStamp: 1299,
  });
  expect(taps).toEqual([
    [105.9 - surface.rect.left, 200 - surface.rect.top, 'pen'],
  ]);
  expect(userInputs).toBe(0);
  expect(surface.rectReads).toBe(1);

  taps.length = 0;
  const dragged = setup();
  const draggedTaps: string[] = [];
  dragged.input.onTap((_x, _y, pointerType) => {
    draggedTaps.push(pointerType);
  });
  pointer(dragged.surface, 'pointerdown', {
    clientX: 0,
    clientY: 0,
    timeStamp: 0,
  });
  pointer(dragged.surface, 'pointermove', {
    clientX: 6,
    clientY: 0,
    timeStamp: 40,
  });
  pointer(dragged.surface, 'pointerup', {
    clientX: 6,
    clientY: 0,
    timeStamp: 100,
  });
  expect(draggedTaps).toEqual([]);
  expect(dragged.read().azimuth).not.toBeCloseTo(0, 8);

  const held = setup();
  const heldTaps: string[] = [];
  let heldInputs = 0;
  held.controller.onUserInput(() => {
    heldInputs += 1;
  });
  held.input.onTap(() => {
    heldTaps.push('tap');
  });
  const heldAzimuth = held.read().azimuth;
  pointer(held.surface, 'pointerdown', {
    clientX: 10,
    clientY: 10,
    timeStamp: 0,
  });
  pointer(held.surface, 'pointermove', {
    clientX: 12,
    clientY: 10,
    timeStamp: 100,
  });
  pointer(held.surface, 'pointerup', {
    clientX: 12,
    clientY: 10,
    timeStamp: 300,
  });
  expect(heldTaps).toEqual([]);
  expect(heldInputs).toBe(0);
  expect(held.read().azimuth).toBe(heldAzimuth);

  const pinch = setup();
  const pinchTaps: string[] = [];
  pinch.input.onTap(() => {
    pinchTaps.push('tap');
  });
  pointer(pinch.surface, 'pointerdown', {
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    pointerType: 'touch',
    timeStamp: 0,
  });
  pointer(pinch.surface, 'pointerdown', {
    pointerId: 2,
    clientX: 30,
    clientY: 0,
    pointerType: 'touch',
    timeStamp: 10,
  });
  pointer(pinch.surface, 'pointerup', {
    pointerId: 2,
    clientX: 30,
    clientY: 0,
    pointerType: 'touch',
    timeStamp: 40,
  });
  pointer(pinch.surface, 'pointerup', {
    pointerId: 1,
    clientX: 1,
    clientY: 0,
    pointerType: 'touch',
    timeStamp: 80,
  });
  expect(pinchTaps).toEqual([]);
  expect(read().azimuth).toBeCloseTo(0, 10);
});

test('NaN events are skipped', () => {
  const { surface, read } = setup();
  pointer(surface, 'pointerdown', { clientX: 20, clientY: 10, timeStamp: 0 });
  const azimuth = read().azimuth;
  const polar = read().polar;
  const distance = read().distance;

  expect(() => {
    pointer(surface, 'pointermove', {
      clientX: Number.NaN,
      clientY: 10,
      timeStamp: 10,
    });
    pointer(surface, 'pointermove', {
      clientX: 20,
      clientY: Number.POSITIVE_INFINITY,
      timeStamp: 20,
    });
  }).not.toThrow();
  expect(read().azimuth).toBe(azimuth);
  expect(read().polar).toBe(polar);
  expect(read().distance).toBe(distance);

  const nanWheel = wheel(surface, { deltaY: Number.NaN, timeStamp: 30 });
  const infiniteWheel = wheel(surface, {
    deltaX: Number.NEGATIVE_INFINITY,
    deltaY: 100,
    timeStamp: 40,
  });
  expect(nanWheel.defaultPrevented).toBe(false);
  expect(infiniteWheel.defaultPrevented).toBe(false);
  expect(read().azimuth).toBe(azimuth);
  expect(read().distance).toBe(distance);

  pointer(surface, 'pointermove', { clientX: 120, clientY: 10, timeStamp: 50 });
  expect(read().azimuth).toBeCloseTo(
    azimuth + rotationFor(100, 0).dAzimuth,
    10,
  );
});

test('edge cases', () => {
  const flat = setup();
  flat.surface.clientHeight = 0;
  pointer(flat.surface, 'pointerdown', { clientX: 0, clientY: 0 });
  expect(() => {
    pointer(flat.surface, 'pointermove', { clientX: 100, clientY: 40 });
  }).not.toThrow();
  expect(flat.read().azimuth).toBeCloseTo(0, 10);
  expect(flat.read().polar).toBeCloseTo((55 * Math.PI) / 180, 10);
  expect(Number.isFinite(flat.read().distance)).toBe(true);

  const third = setup();
  const beforeThird = third.read().distance;
  pointer(third.surface, 'pointerdown', {
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    pointerType: 'touch',
  });
  pointer(third.surface, 'pointerdown', {
    pointerId: 2,
    clientX: 100,
    clientY: 0,
    pointerType: 'touch',
  });
  pointer(third.surface, 'pointerdown', {
    pointerId: 3,
    clientX: 40,
    clientY: 40,
    pointerType: 'touch',
  });
  pointer(third.surface, 'pointermove', {
    pointerId: 3,
    clientX: 200,
    clientY: 80,
    pointerType: 'touch',
  });
  expect(third.read().distance).toBe(beforeThird);
  pointer(third.surface, 'pointermove', {
    pointerId: 2,
    clientX: 200,
    clientY: 0,
    pointerType: 'touch',
  });
  expect(third.read().distance).toBeCloseTo(beforeThird * (100 / 200), 10);

  const collapsed = setup();
  const collapsedDistance = collapsed.read().distance;
  pointer(collapsed.surface, 'pointerdown', {
    pointerId: 1,
    clientX: 10,
    clientY: 10,
    pointerType: 'touch',
  });
  pointer(collapsed.surface, 'pointerdown', {
    pointerId: 2,
    clientX: 10,
    clientY: 10,
    pointerType: 'touch',
  });
  pointer(collapsed.surface, 'pointermove', {
    pointerId: 2,
    clientX: 10,
    clientY: 10,
    pointerType: 'touch',
  });
  expect(collapsed.read().distance).toBe(collapsedDistance);
  pointer(collapsed.surface, 'pointermove', {
    pointerId: 2,
    clientX: 10,
    clientY: 90,
    pointerType: 'touch',
  });
  expect(collapsed.read().distance).toBe(collapsedDistance);
  pointer(collapsed.surface, 'pointermove', {
    pointerId: 2,
    clientX: 10,
    clientY: 170,
    pointerType: 'touch',
  });
  expect(collapsed.read().distance).toBeCloseTo(
    collapsedDistance * (80 / 160),
    10,
  );

  const lift = setup();
  pointer(lift.surface, 'pointerdown', {
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    pointerType: 'touch',
    timeStamp: 0,
  });
  pointer(lift.surface, 'pointerdown', {
    pointerId: 2,
    clientX: 0,
    clientY: 100,
    pointerType: 'touch',
    timeStamp: 10,
  });
  pointer(lift.surface, 'pointermove', {
    pointerId: 1,
    clientX: 80,
    clientY: 0,
    pointerType: 'touch',
    timeStamp: 20,
  });
  expect(lift.read().azimuth).toBeCloseTo(0, 10);
  pointer(lift.surface, 'pointerup', {
    pointerId: 2,
    clientX: 0,
    clientY: 100,
    pointerType: 'touch',
    timeStamp: 30,
  });
  pointer(lift.surface, 'pointermove', {
    pointerId: 1,
    clientX: 80,
    clientY: 4,
    pointerType: 'touch',
    timeStamp: 40,
  });
  expect(lift.read().azimuth).toBeCloseTo(0, 10);
  pointer(lift.surface, 'pointermove', {
    pointerId: 1,
    clientX: 80,
    clientY: 34,
    pointerType: 'touch',
    timeStamp: 50,
  });
  expect(lift.read().azimuth).toBeCloseTo(0, 10);
  expect(lift.read().polar).toBeCloseTo(
    (55 * Math.PI) / 180 + rotationFor(0, 34).dPolar,
    10,
  );

  const cancel = setup();
  const cancelTaps: string[] = [];
  cancel.input.onTap(() => {
    cancelTaps.push('tap');
  });
  pointer(cancel.surface, 'pointerdown', {
    clientX: 5,
    clientY: 5,
    timeStamp: 0,
  });
  pointer(cancel.surface, 'pointermove', {
    clientX: 7,
    clientY: 5,
    timeStamp: 20,
  });
  pointer(cancel.surface, 'pointercancel', {
    clientX: 7,
    clientY: 5,
    timeStamp: 40,
  });
  pointer(cancel.surface, 'pointerup', {
    clientX: 7,
    clientY: 5,
    timeStamp: 50,
  });
  expect(cancelTaps).toEqual([]);

  const lost = setup();
  const lostTaps: string[] = [];
  lost.input.onTap(() => {
    lostTaps.push('tap');
  });
  pointer(lost.surface, 'pointerdown', {
    clientX: 0,
    clientY: 0,
    timeStamp: 0,
  });
  pointer(lost.surface, 'pointermove', {
    clientX: 90,
    clientY: 0,
    timeStamp: 20,
  });
  const azimuthAfterDrag = lost.read().azimuth;
  pointer(lost.surface, 'lostpointercapture', {
    clientX: 90,
    clientY: 0,
    timeStamp: 30,
  });
  pointer(lost.surface, 'pointermove', {
    clientX: 200,
    clientY: 0,
    timeStamp: 40,
  });
  pointer(lost.surface, 'pointerup', {
    clientX: 200,
    clientY: 0,
    timeStamp: 50,
  });
  expect(lostTaps).toEqual([]);
  expect(lost.read().azimuth).toBeCloseTo(azimuthAfterDrag, 10);

  const zero = setup();
  let zeroInputs = 0;
  zero.controller.onUserInput(() => {
    zeroInputs += 1;
  });
  const zeroDistance = zero.read().distance;
  wheel(zero.surface, { deltaX: 0, deltaY: 0, timeStamp: 0 });
  expect(zero.read().distance).toBe(zeroDistance);
  expect(zero.read().azimuth).toBeCloseTo(0, 10);
  expect(zeroInputs).toBe(0);

  const extreme = setup();
  const limits = extreme.controller.getState({
    azimuthDeg: 0,
    polarDeg: 0,
    distance: 0,
    distanceMin: 0,
    distanceMax: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  });
  wheel(extreme.surface, { deltaY: 10000, ctrlKey: true, timeStamp: 0 });
  expect(extreme.read().distance).toBe(limits.distanceMax);
  expect(Number.isFinite(extreme.read().distance)).toBe(true);
});

test('dispose removes listeners', () => {
  const { surface, input, read } = setup();
  expect(surface.addCount).toBe(6);
  pointer(surface, 'pointerdown', { clientX: 0, clientY: 0 });
  pointer(surface, 'pointermove', { clientX: 30, clientY: 0 });
  const azimuth = read().azimuth;

  input.dispose();
  expect(surface.removeCount).toBe(surface.addCount);
  pointer(surface, 'pointermove', { clientX: 200, clientY: 80 });
  wheel(surface, { deltaY: 100, timeStamp: 10 });
  expect(read().azimuth).toBeCloseTo(azimuth, 10);
  expect(read().distance).toBe(startDistance(ASPECT));

  input.dispose();
  expect(surface.removeCount).toBe(surface.addCount);
  expect(read().azimuth).toBeCloseTo(azimuth, 10);
});

test('handlers do not allocate', () => {
  const { surface } = setup();
  pointer(surface, 'pointerdown', {
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    timeStamp: 0,
  });
  pointer(surface, 'pointermove', {
    pointerId: 1,
    clientX: 20,
    clientY: 0,
    timeStamp: 16,
  });
  wheel(surface, { deltaX: 2, deltaY: 1.25, timeStamp: 32 });

  const move = new Event('pointermove', { cancelable: true });
  defineField(move, 'pointerId', 1);
  defineField(move, 'clientX', 20);
  defineField(move, 'clientY', 0);
  defineField(move, 'button', 0);
  defineField(move, 'pointerType', 'mouse');
  defineField(move, 'timeStamp', 40);
  const roll = new Event('wheel', { cancelable: true });
  defineField(roll, 'deltaX', 1.5);
  defineField(roll, 'deltaY', 0.5);
  defineField(roll, 'deltaMode', 0);
  defineField(roll, 'ctrlKey', false);
  defineField(roll, 'timeStamp', 48);

  const vector3 = alloc.vector3;
  const spherical = alloc.spherical;
  const push = vi.spyOn(Array.prototype, 'push');
  const splice = vi.spyOn(Array.prototype, 'splice');
  const mapSet = vi.spyOn(Map.prototype, 'set');
  push.mockClear();
  splice.mockClear();
  mapSet.mockClear();

  try {
    for (let index = 0; index < 10000; index += 1) {
      if (index % 2 === 0) {
        defineField(move, 'clientX', 20 + (index % 40));
        defineField(move, 'timeStamp', 40 + index);
        surface.dispatchEvent(move);
      } else {
        defineField(roll, 'timeStamp', 40 + index);
        surface.dispatchEvent(roll);
      }
    }
  } finally {
    const pushCalls = push.mock.calls.length;
    const spliceCalls = splice.mock.calls.length;
    const mapSetCalls = mapSet.mock.calls.length;
    push.mockRestore();
    splice.mockRestore();
    mapSet.mockRestore();
    expect(pushCalls).toBe(0);
    expect(spliceCalls).toBe(0);
    expect(mapSetCalls).toBe(0);
  }

  expect(alloc.vector3).toBe(vector3);
  expect(alloc.spherical).toBe(spherical);
});
