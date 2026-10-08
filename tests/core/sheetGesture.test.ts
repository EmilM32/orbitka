import { describe, expect, it, test } from 'vitest';

import {
  resolveSheetDrag,
  SHEET_DRAG_THRESHOLD_PX,
  SHEET_FLICK_PX_PER_MS,
} from '@core/sheetGesture.ts';

test('constants', () => {
  expect(SHEET_DRAG_THRESHOLD_PX).toBe(40);
  expect(SHEET_FLICK_PX_PER_MS).toBe(0.5);
});

describe('resolveSheetDrag', () => {
  it.each([
    [false, -40, 0, true],
    [false, -39, 0, false],
    [false, -10, -0.6, true],
    [false, -10, -0.5, false],
    [true, 45, 0, false],
    [true, 39, 0, true],
    [true, 10, 0.6, false],
    // A drag up on an open sheet and a drag down on a closed one change nothing.
    [true, -80, -1, true],
    [false, 80, 1, false],
    [false, 0, 0, false],
    [false, 0, -0.8, true],
  ])('(%s, %d, %d) -> %s', (expanded, delta, velocity, result) => {
    expect(resolveSheetDrag(expanded, delta, velocity)).toBe(result);
  });

  it.each([
    [Number.NaN, 0, 'deltaYPx', 'NaN'],
    [0, Number.NaN, 'velocityPxPerMs', 'NaN'],
    [Number.POSITIVE_INFINITY, 0, 'deltaYPx', 'Infinity'],
  ])('rejects %d, %d', (delta, velocity, name, shown) => {
    expect(() => resolveSheetDrag(false, delta, velocity)).toThrow(
      new RangeError(
        `resolveSheetDrag: parameter "${name}" must be a finite number, got ${shown}`,
      ),
    );
  });
});
