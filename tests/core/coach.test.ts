import { describe, expect, it, test, vi } from 'vitest';

import {
  COACH_ROTATE_DEG,
  COACH_STEPS,
  COACH_TOAST_HOLD_MS,
  COACH_ZOOM_RATIO,
  createCoachTracker,
  type CameraUserInput,
} from '@core/coach.ts';

test('constants', () => {
  expect(COACH_ROTATE_DEG).toBe(15);
  expect(COACH_ZOOM_RATIO).toBe(0.15);
  expect(COACH_STEPS).toEqual(['rotate', 'zoom', 'select']);
  expect(COACH_TOAST_HOLD_MS).toBe(3000);
});

test('thresholds', () => {
  const tracker = createCoachTracker();
  expect(tracker.getState()).toEqual({
    done: { rotate: false, zoom: false, select: false },
    current: 'rotate',
    finished: false,
  });

  tracker.onCameraInput({ kind: 'rotate', deg: 10 });
  tracker.onCameraInput({ kind: 'rotate', deg: 4.9 });
  expect(tracker.getState().done.rotate).toBe(false);
  tracker.onCameraInput({ kind: 'rotate', deg: 0.1 });
  expect(tracker.getState().done.rotate).toBe(true);
  expect(tracker.getState().current).toBe('zoom');

  tracker.onCameraInput({ kind: 'zoom', ratio: 0.1 });
  tracker.onCameraInput({ kind: 'zoom', ratio: 0.049 });
  expect(tracker.getState().done.zoom).toBe(false);
  tracker.onCameraInput({ kind: 'zoom', ratio: 0.001 });
  expect(tracker.getState().done.zoom).toBe(true);

  // Three arrow presses of 5° and two "+" steps of 0.1 are enough.
  const keys = createCoachTracker();
  for (let index = 0; index < 3; index += 1) {
    keys.onCameraInput({ kind: 'rotate', deg: 5 });
  }
  keys.onCameraInput({ kind: 'zoom', ratio: 0.1 });
  keys.onCameraInput({ kind: 'zoom', ratio: 0.1 });
  expect(keys.getState().done).toEqual({
    rotate: true,
    zoom: true,
    select: false,
  });
});

test('steps in any order', () => {
  const tracker = createCoachTracker();
  const listener = vi.fn();
  tracker.subscribe(listener);
  tracker.onSelected();
  expect(tracker.getState().done.select).toBe(true);
  expect(tracker.getState().current).toBe('rotate');
  tracker.onCameraInput({ kind: 'zoom', ratio: 0.2 });
  expect(tracker.getState().current).toBe('rotate');
  tracker.onCameraInput({ kind: 'rotate', deg: 20 });
  expect(tracker.getState()).toEqual({
    done: { rotate: true, zoom: true, select: true },
    current: null,
    finished: true,
  });
  expect(listener).toHaveBeenCalledTimes(3);
});

describe('rejects invalid input', () => {
  it.each([
    [{ kind: 'rotate', deg: -1 }, 'deg', '-1'],
    [{ kind: 'rotate', deg: Number.NaN }, 'deg', 'NaN'],
    [{ kind: 'rotate', deg: Number.POSITIVE_INFINITY }, 'deg', 'Infinity'],
    [{ kind: 'zoom', ratio: -0.5 }, 'ratio', '-0.5'],
    [{ kind: 'zoom', ratio: Number.NaN }, 'ratio', 'NaN'],
  ] as Array<[CameraUserInput, string, string]>)('%o', (input, name, shown) => {
    const tracker = createCoachTracker();
    expect(() => tracker.onCameraInput(input)).toThrow(
      new RangeError(
        `coach.onCameraInput: parameter "input.${name}" must be a finite number >= 0, got ${shown}`,
      ),
    );
  });
});

test('ignores input after finish', () => {
  const tracker = createCoachTracker();
  tracker.onSelected();
  tracker.onCameraInput({ kind: 'rotate', deg: 15 });
  tracker.onCameraInput({ kind: 'zoom', ratio: 0.15 });
  expect(tracker.getState().finished).toBe(true);
  const listener = vi.fn();
  const unsubscribe = tracker.subscribe(listener);
  const state = tracker.getState();
  tracker.onSelected();
  tracker.onCameraInput({ kind: 'rotate', deg: 90 });
  tracker.onCameraInput({ kind: 'zoom', ratio: -1 });
  expect(listener).not.toHaveBeenCalled();
  expect(tracker.getState()).toBe(state);
  unsubscribe();
});

test('repeated input after a step is done notifies once', () => {
  const tracker = createCoachTracker();
  const listener = vi.fn();
  const unsubscribe = tracker.subscribe(listener);
  for (let index = 0; index < 10; index += 1) {
    tracker.onCameraInput({ kind: 'rotate', deg: 5 });
  }
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  tracker.onSelected();
  expect(listener).toHaveBeenCalledTimes(1);
});
