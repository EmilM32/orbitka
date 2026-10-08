// Rendering budgets from ADR-010 point 8 (EMI-216). The only source of these
// numbers in src; e2e copies them as literals because it imports nothing from
// src.

// Scene draw calls without debug objects and without post-processing. Replaces
// the 25 of ADR-006 and ADR-009 for stage 1.
export const DRAW_CALL_BUDGET = 28;
// Post-processing passes, stage 2. Always 0 in stage 1.
export const POSTFX_DRAW_CALL_BUDGET = 16;
export const TRIANGLE_BUDGET = 60_000;
export const TEXTURE_MEMORY_BUDGET_MIB = {
  high: 48,
  medium: 24,
  low: 16,
} as const;

export type QualityBudgetLevel = keyof typeof TEXTURE_MEMORY_BUDGET_MIB;
