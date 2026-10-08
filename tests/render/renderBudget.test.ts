import { expect, test } from 'vitest';

import {
  DRAW_CALL_BUDGET,
  POSTFX_DRAW_CALL_BUDGET,
  TEXTURE_MEMORY_BUDGET_MIB,
  TRIANGLE_BUDGET,
} from '@render/renderBudget.ts';

test('renderBudget › golden values', () => {
  expect(DRAW_CALL_BUDGET).toBe(28);
  expect(POSTFX_DRAW_CALL_BUDGET).toBe(16);
  expect(TRIANGLE_BUDGET).toBe(60_000);
  expect(TEXTURE_MEMORY_BUDGET_MIB).toEqual({ high: 48, medium: 24, low: 16 });
});
