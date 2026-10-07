import { expect, test } from 'vitest';

import { createBodyScreenFrame } from '@core/bodyScreenFrame.ts';
import { createSelection, type Selection } from '@core/selection.ts';
import { createBodyPicker } from '@render/bodyPicker.ts';
import {
  createCameraPointerInput,
  type CameraPointerInput,
} from '@render/cameraPointerInput.ts';

const IDS = ['sun', 'mercury', 'venus', 'earth', 'mars'];

class Surface extends EventTarget {
  clientHeight = 720;
  readonly rect = { left: 15, top: 25 };
  readonly style = { touchAction: '', cursor: '' };
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

function pointer(
  surface: Surface,
  type: string,
  fields: Record<string, unknown>,
): void {
  const event = new Event(type, { cancelable: true });
  const names = Object.keys(fields);
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    if (name !== undefined) {
      defineField(event, name, fields[name]);
    }
  }
  surface.dispatchEvent(event);
}

function setup(): {
  surface: Surface;
  input: CameraPointerInput;
  selection: Selection;
} {
  const surface = new Surface();
  const input = createCameraPointerInput({
    surface,
    controller: {
      rotateBy() {
        return undefined;
      },
      zoomBy() {
        return undefined;
      },
      notifyUserInput() {
        return undefined;
      },
    },
  });
  return { surface, input, selection: createSelection(IDS) };
}

function client(
  surface: Surface,
  x: number,
  y: number,
): {
  clientX: number;
  clientY: number;
} {
  return { clientX: surface.rect.left + x, clientY: surface.rect.top + y };
}

test('hover sets cursor and hovered id', () => {
  const { surface, input, selection } = setup();
  const frame = createBodyScreenFrame(IDS);
  frame.x[4] = 100;
  frame.y[4] = 80;
  frame.depth[4] = 10;
  frame.radiusPx[4] = 8;
  frame.visible[4] = 1;
  const picker = createBodyPicker({
    surface,
    frame,
    selection,
    pointerInput: input,
  });
  const mars = client(surface, 100, 80);

  pointer(surface, 'pointermove', {
    pointerId: 1,
    ...mars,
    button: 0,
    buttons: 0,
    pointerType: 'mouse',
    timeStamp: 0,
  });
  expect(surface.style.cursor).toBe('pointer');
  expect(selection.getHoveredId()).toBe('mars');
  expect(surface.rectReads).toBe(1);

  pointer(surface, 'pointermove', {
    pointerId: 1,
    ...client(surface, 104, 82),
    button: 0,
    buttons: 0,
    pointerType: 'pen',
    timeStamp: 16,
  });
  expect(selection.getHoveredId()).toBe('mars');
  expect(surface.style.cursor).toBe('pointer');
  expect(surface.rectReads).toBe(1);

  pointer(surface, 'pointermove', {
    pointerId: 1,
    ...client(surface, 0, 0),
    button: 0,
    buttons: 0,
    pointerType: 'mouse',
    timeStamp: 32,
  });
  expect(selection.getHoveredId()).toBeNull();
  expect(surface.style.cursor).toBe('');

  pointer(surface, 'pointermove', {
    pointerId: 1,
    ...mars,
    button: 0,
    buttons: 0,
    pointerType: 'mouse',
    timeStamp: 40,
  });
  expect(selection.getHoveredId()).toBe('mars');
  surface.dispatchEvent(new Event('pointerleave'));
  expect(selection.getHoveredId()).toBeNull();
  expect(surface.style.cursor).toBe('');

  pointer(surface, 'pointermove', {
    pointerId: 1,
    ...mars,
    button: 0,
    buttons: 1,
    pointerType: 'mouse',
    timeStamp: 48,
  });
  expect(selection.getHoveredId()).toBeNull();
  expect(surface.style.cursor).toBe('');

  pointer(surface, 'pointermove', {
    pointerId: 1,
    ...mars,
    button: 0,
    buttons: 0,
    pointerType: 'touch',
    timeStamp: 56,
  });
  expect(selection.getHoveredId()).toBeNull();
  expect(surface.style.cursor).toBe('');

  picker.dispose();
  input.dispose();
  selection.dispose();
});

test('tap selects, drag does not', () => {
  const { surface, input, selection } = setup();
  const frame = createBodyScreenFrame(IDS);
  frame.x[4] = 100;
  frame.y[4] = 80;
  frame.depth[4] = 12;
  frame.radiusPx[4] = 6;
  frame.visible[4] = 1;
  frame.x[3] = 300;
  frame.y[3] = 200;
  frame.depth[3] = 20;
  frame.radiusPx[3] = 6;
  frame.visible[3] = 1;
  const picker = createBodyPicker({
    surface,
    frame,
    selection,
    pointerInput: input,
  });
  const events: string[] = [];
  selection.subscribe((event) => {
    if (event.kind === 'selected') {
      events.push(event.id);
    }
  });

  const mars = client(surface, 100, 80);
  pointer(surface, 'pointerdown', {
    pointerId: 1,
    ...mars,
    button: 0,
    buttons: 1,
    pointerType: 'mouse',
    timeStamp: 0,
  });
  pointer(surface, 'pointerup', {
    pointerId: 1,
    clientX: mars.clientX + 5.9,
    clientY: mars.clientY,
    button: 0,
    buttons: 0,
    pointerType: 'mouse',
    timeStamp: 299,
  });
  expect(selection.getSelectedId()).toBe('mars');
  expect(events).toEqual(['mars']);

  pointer(surface, 'pointerdown', {
    pointerId: 2,
    ...mars,
    button: 0,
    buttons: 1,
    pointerType: 'mouse',
    timeStamp: 400,
  });
  pointer(surface, 'pointerup', {
    pointerId: 2,
    clientX: mars.clientX + 1,
    clientY: mars.clientY,
    button: 0,
    buttons: 0,
    pointerType: 'mouse',
    timeStamp: 500,
  });
  expect(events).toEqual(['mars']);

  selection.showSystem();
  pointer(surface, 'pointerdown', {
    pointerId: 3,
    ...mars,
    button: 0,
    buttons: 1,
    pointerType: 'mouse',
    timeStamp: 600,
  });
  pointer(surface, 'pointerup', {
    pointerId: 3,
    clientX: mars.clientX + 6,
    clientY: mars.clientY,
    button: 0,
    buttons: 0,
    pointerType: 'mouse',
    timeStamp: 700,
  });
  expect(selection.getSelectedId()).toBeNull();

  pointer(surface, 'pointerdown', {
    pointerId: 4,
    ...mars,
    button: 0,
    buttons: 1,
    pointerType: 'mouse',
    timeStamp: 800,
  });
  pointer(surface, 'pointerup', {
    pointerId: 4,
    clientX: mars.clientX,
    clientY: mars.clientY,
    button: 0,
    buttons: 0,
    pointerType: 'mouse',
    timeStamp: 1100,
  });
  expect(selection.getSelectedId()).toBeNull();

  const earth = client(surface, 300, 200);
  pointer(surface, 'pointerdown', {
    pointerId: 5,
    ...earth,
    button: 0,
    buttons: 1,
    pointerType: 'mouse',
    timeStamp: 1200,
  });
  pointer(surface, 'pointerup', {
    pointerId: 5,
    ...earth,
    button: 0,
    buttons: 0,
    pointerType: 'mouse',
    timeStamp: 1300,
  });
  expect(selection.getSelectedId()).toBe('earth');
  expect(events).toEqual(['mars', 'earth']);

  picker.dispose();
  input.dispose();
  selection.dispose();
});

test('empty space tap does nothing', () => {
  const { surface, input, selection } = setup();
  const frame = createBodyScreenFrame(IDS);
  frame.x[4] = 100;
  frame.y[4] = 80;
  frame.depth[4] = 10;
  frame.radiusPx[4] = 4;
  frame.visible[4] = 1;
  const picker = createBodyPicker({
    surface,
    frame,
    selection,
    pointerInput: input,
  });
  let selected = 0;
  selection.subscribe((event) => {
    if (event.kind === 'selected') {
      selected += 1;
    }
  });

  pointer(surface, 'pointermove', {
    pointerId: 1,
    ...client(surface, 10, 10),
    button: 0,
    buttons: 0,
    pointerType: 'mouse',
    timeStamp: 0,
  });
  expect(surface.style.cursor).toBe('');

  const empty = client(surface, 10, 10);
  pointer(surface, 'pointerdown', {
    pointerId: 1,
    ...empty,
    button: 0,
    buttons: 1,
    pointerType: 'mouse',
    timeStamp: 20,
  });
  pointer(surface, 'pointerup', {
    pointerId: 1,
    ...empty,
    button: 0,
    buttons: 0,
    pointerType: 'mouse',
    timeStamp: 40,
  });
  expect(selected).toBe(0);
  expect(selection.getSelectedId()).toBeNull();
  expect(surface.style.cursor).toBe('');

  picker.dispose();
  input.dispose();
  selection.dispose();
});

test('touch uses 44 px radius', () => {
  const { surface, input, selection } = setup();
  const frame = createBodyScreenFrame(IDS);
  frame.x[1] = 200;
  frame.y[1] = 200;
  frame.depth[1] = 10;
  frame.radiusPx[1] = 1;
  frame.visible[1] = 1;
  const picker = createBodyPicker({
    surface,
    frame,
    selection,
    pointerInput: input,
  });
  const near = client(surface, 240, 200);

  pointer(surface, 'pointerdown', {
    pointerId: 1,
    ...near,
    button: 0,
    buttons: 1,
    pointerType: 'mouse',
    timeStamp: 0,
  });
  pointer(surface, 'pointerup', {
    pointerId: 1,
    ...near,
    button: 0,
    buttons: 0,
    pointerType: 'mouse',
    timeStamp: 20,
  });
  expect(selection.getSelectedId()).toBeNull();

  pointer(surface, 'pointerdown', {
    pointerId: 2,
    ...near,
    button: 0,
    buttons: 1,
    pointerType: 'touch',
    timeStamp: 40,
  });
  pointer(surface, 'pointerup', {
    pointerId: 2,
    ...near,
    button: 0,
    buttons: 0,
    pointerType: 'touch',
    timeStamp: 60,
  });
  expect(selection.getSelectedId()).toBe('mercury');

  selection.showSystem();
  const typed = client(surface, 220, 200);
  pointer(surface, 'pointerdown', {
    pointerId: 3,
    ...typed,
    button: 0,
    buttons: 1,
    pointerType: '',
    timeStamp: 80,
  });
  pointer(surface, 'pointerup', {
    pointerId: 3,
    ...typed,
    button: 0,
    buttons: 0,
    pointerType: '',
    timeStamp: 100,
  });
  expect(selection.getSelectedId()).toBe('mercury');

  selection.showSystem();
  const miss = client(surface, 230, 200);
  pointer(surface, 'pointerdown', {
    pointerId: 4,
    ...miss,
    button: 0,
    buttons: 1,
    pointerType: '',
    timeStamp: 120,
  });
  pointer(surface, 'pointerup', {
    pointerId: 4,
    ...miss,
    button: 0,
    buttons: 0,
    pointerType: '',
    timeStamp: 140,
  });
  expect(selection.getSelectedId()).toBeNull();

  picker.dispose();
  input.dispose();
  selection.dispose();
});

test('NaN coordinates are skipped', () => {
  const { surface, input, selection } = setup();
  const frame = createBodyScreenFrame(IDS);
  frame.x[4] = 100;
  frame.y[4] = 80;
  frame.depth[4] = 10;
  frame.radiusPx[4] = 8;
  frame.visible[4] = 1;
  const picker = createBodyPicker({
    surface,
    frame,
    selection,
    pointerInput: input,
  });
  pointer(surface, 'pointermove', {
    pointerId: 1,
    ...client(surface, 100, 80),
    button: 0,
    buttons: 0,
    pointerType: 'mouse',
    timeStamp: 0,
  });
  expect(selection.getHoveredId()).toBe('mars');

  expect(() => {
    pointer(surface, 'pointermove', {
      pointerId: 1,
      clientX: Number.NaN,
      clientY: 80,
      button: 0,
      buttons: 0,
      pointerType: 'mouse',
      timeStamp: 16,
    });
  }).not.toThrow();
  expect(selection.getHoveredId()).toBe('mars');
  expect(surface.style.cursor).toBe('pointer');

  expect(() => {
    pointer(surface, 'pointerdown', {
      pointerId: 7,
      clientX: Number.NaN,
      clientY: Number.NaN,
      button: 0,
      buttons: 1,
      pointerType: 'mouse',
      timeStamp: 20,
    });
    pointer(surface, 'pointerup', {
      pointerId: 7,
      clientX: Number.NaN,
      clientY: Number.NaN,
      button: 0,
      buttons: 0,
      pointerType: 'mouse',
      timeStamp: 30,
    });
  }).not.toThrow();
  expect(selection.getSelectedId()).toBeNull();

  picker.dispose();
  input.dispose();
  selection.dispose();
});

test('dispose removes listeners', () => {
  const { surface, input, selection } = setup();
  const frame = createBodyScreenFrame(IDS);
  frame.x[4] = 40;
  frame.y[4] = 40;
  frame.depth[4] = 5;
  frame.radiusPx[4] = 10;
  frame.visible[4] = 1;
  const added = surface.addCount;
  const removed = surface.removeCount;
  const picker = createBodyPicker({
    surface,
    frame,
    selection,
    pointerInput: input,
  });
  expect(surface.addCount - added).toBe(2);

  picker.dispose();
  expect(surface.removeCount - removed).toBe(2);
  picker.dispose();
  expect(surface.removeCount - removed).toBe(2);

  pointer(surface, 'pointermove', {
    pointerId: 1,
    ...client(surface, 40, 40),
    button: 0,
    buttons: 0,
    pointerType: 'mouse',
    timeStamp: 0,
  });
  expect(selection.getHoveredId()).toBeNull();
  expect(surface.style.cursor).toBe('');

  input.dispose();
  selection.dispose();
});
