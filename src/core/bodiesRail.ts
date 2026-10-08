import { VIEW_CONFIG } from './viewConfig.ts';

export type RailInput = {
  viewportWidthPx: number;
  hasSelection: boolean;
  userCollapsed: boolean;
};

/**
 * The bodies list folds into the 56 px rail when the user folds it, or when a
 * body is selected (the card is open) and the window is at most 1440 px wide
 * (SPEC §5.4).
 */
export function shouldShowRail(input: RailInput): boolean {
  const width = input.viewportWidthPx;
  if (!Number.isFinite(width) || width < 0) {
    throw new RangeError(
      `shouldShowRail: parameter "viewportWidthPx" must be finite and >= 0, got ${width}`,
    );
  }
  return (
    input.userCollapsed ||
    (input.hasSelection && width <= VIEW_CONFIG.railMaxWidthPx)
  );
}
