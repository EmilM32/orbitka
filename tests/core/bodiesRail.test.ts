import { expect, test } from 'vitest';

import { shouldShowRail } from '@core/bodiesRail.ts';

test.each([
  [1280, true, false, true],
  [1441, true, false, false],
  [1440, true, false, true],
  [1920, false, true, true],
  [1920, true, false, false],
  [1280, false, false, false],
])(
  'rail rule (%i px, selection %s, folded %s) → %s',
  (viewportWidthPx, hasSelection, userCollapsed, expected) => {
    expect(
      shouldShowRail({ viewportWidthPx, hasSelection, userCollapsed }),
    ).toBe(expected);
  },
);

test.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
  'rail rule rejects width %s',
  (viewportWidthPx) => {
    expect(() =>
      shouldShowRail({
        viewportWidthPx,
        hasSelection: true,
        userCollapsed: false,
      }),
    ).toThrow(
      new RangeError(
        `shouldShowRail: parameter "viewportWidthPx" must be finite and >= 0, got ${viewportWidthPx}`,
      ),
    );
  },
);
