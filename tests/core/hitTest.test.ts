import { expect, test, vi } from 'vitest';

import {
  createBodyScreenFrame,
  type BodyScreenFrame,
} from '@core/bodyScreenFrame.ts';
import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import { pickBody } from '@core/hitTest.ts';

const MOUSE = CAMERA_CONFIG.hitRadiusMousePx;
const TOUCH = CAMERA_CONFIG.hitRadiusTouchPx;

function place(
  frame: BodyScreenFrame,
  index: number,
  x: number,
  y: number,
  depth: number,
  radiusPx: number,
  visible = 1,
): void {
  frame.x[index] = x;
  frame.y[index] = y;
  frame.depth[index] = depth;
  frame.radiusPx[index] = radiusPx;
  frame.visible[index] = visible;
}

test('hit radius 24 and 44', () => {
  const frame = createBodyScreenFrame(['mercury']);
  place(frame, 0, 0, 0, 10, 1);

  expect(pickBody(frame, MOUSE - 0.1, 0, 'mouse')).toBe('mercury');
  expect(pickBody(frame, MOUSE, 0, 'mouse')).toBe('mercury');
  expect(pickBody(frame, MOUSE + 0.1, 0, 'mouse')).toBeNull();
  expect(pickBody(frame, MOUSE - 0.1, 0, 'pen')).toBe('mercury');
  expect(pickBody(frame, MOUSE + 0.1, 0, 'pen')).toBeNull();
  expect(pickBody(frame, MOUSE - 0.1, 0, '')).toBe('mercury');
  expect(pickBody(frame, MOUSE + 0.1, 0, '')).toBeNull();

  expect(pickBody(frame, TOUCH - 0.1, 0, 'touch')).toBe('mercury');
  expect(pickBody(frame, TOUCH, 0, 'touch')).toBe('mercury');
  expect(pickBody(frame, TOUCH + 0.1, 0, 'touch')).toBeNull();
  expect(pickBody(frame, 1000, 1000, 'mouse')).toBeNull();

  const large = createBodyScreenFrame(['jupiter']);
  const radiusPx = MOUSE + 40;
  place(large, 0, 0, 0, 5, radiusPx);
  expect(pickBody(large, radiusPx - 0.1, 0, 'mouse')).toBe('jupiter');
  expect(pickBody(large, radiusPx, 0, 'mouse')).toBe('jupiter');
  expect(pickBody(large, radiusPx + 0.1, 0, 'mouse')).toBeNull();
  expect(pickBody(large, MOUSE + 10, 0, 'mouse')).toBe('jupiter');
});

test('disc beats nearer center', () => {
  const frame = createBodyScreenFrame(['sun', 'mercury']);
  place(frame, 0, 0, 0, 80, 30);
  place(frame, 1, 20, 0, 10, 3);

  expect(pickBody(frame, 16, 0, 'mouse')).toBe('sun');
  expect(pickBody(frame, 32, 0, 'mouse')).toBe('mercury');
});

test('nearest depth wins', () => {
  const frame = createBodyScreenFrame(['far', 'near']);
  place(frame, 0, 0, 0, 40, 20);
  place(frame, 1, 10, 0, 12, 20);

  expect(pickBody(frame, 8, 0, 'mouse')).toBe('near');

  const tie = createBodyScreenFrame(['deeper', 'closer']);
  place(tie, 0, -10, 0, 30, 1);
  place(tie, 1, 10, 0, 9, 1);
  expect(pickBody(tie, 0, 0, 'mouse')).toBe('closer');
});

test('invisible bodies are skipped', () => {
  const frame = createBodyScreenFrame(['sun', 'earth']);
  place(frame, 0, 0, 0, 1, 40, 0);
  place(frame, 1, 0, 0, 5, 10, 0);

  expect(pickBody(frame, 0, 0, 'mouse')).toBeNull();
  expect(pickBody(frame, 0, 0, 'touch')).toBeNull();

  place(frame, 1, 18, 0, 5, 2, 1);
  expect(pickBody(frame, 0, 0, 'mouse')).toBe('earth');
});

test('NaN coordinates', () => {
  const frame = createBodyScreenFrame(['earth']);
  place(frame, 0, 0, 0, 4, 8);

  expect(pickBody(frame, Number.NaN, 0, 'mouse')).toBeNull();
  expect(pickBody(frame, 0, Number.NaN, 'mouse')).toBeNull();
  expect(pickBody(frame, Number.NaN, Number.NaN, 'touch')).toBeNull();
  expect(pickBody(frame, Number.POSITIVE_INFINITY, 0, 'mouse')).toBeNull();
  expect(pickBody(frame, 0, Number.NEGATIVE_INFINITY, 'pen')).toBeNull();
});

test('empty frame', () => {
  const frame = createBodyScreenFrame([]);
  expect(frame.count).toBe(0);
  expect(pickBody(frame, 0, 0, 'mouse')).toBeNull();
  expect(pickBody(frame, Number.NaN, 0, 'touch')).toBeNull();
});

test('pickBody does not allocate', () => {
  const frame = createBodyScreenFrame(['sun', 'mercury']);
  place(frame, 0, 0, 0, 20, 12);
  place(frame, 1, 40, 0, 8, 2);
  expect(pickBody(frame, 4, 1, 'mouse')).toBe(frame.ids[0]);

  const push = vi.spyOn(Array.prototype, 'push');
  const splice = vi.spyOn(Array.prototype, 'splice');
  const mapSet = vi.spyOn(Map.prototype, 'set');
  push.mockClear();
  splice.mockClear();
  mapSet.mockClear();

  try {
    for (let index = 0; index < 1000; index += 1) {
      const picked = pickBody(frame, 4, 1, 'mouse');
      if (typeof picked !== 'string' || Array.isArray(picked)) {
        throw new Error('pickBody returned a non-string');
      }
      if (index === 0 && picked !== 'sun') {
        throw new Error(`pickBody missed the sun disc, got ${String(picked)}`);
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
});
