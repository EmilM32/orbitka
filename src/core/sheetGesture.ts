// Drag on the bottom sheet handle (SPEC §5.6): a drag of at least 40 px or a
// flick faster than 0.5 px/ms toggles the sheet in the drag direction.

export const SHEET_DRAG_THRESHOLD_PX = 40;
export const SHEET_FLICK_PX_PER_MS = 0.5;

function requireFinite(parameter: string, value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(
      `resolveSheetDrag: parameter "${parameter}" must be a finite number, got ${String(value)}`,
    );
  }
}

/** Returns the new `expanded` state. Negative values point up. */
export function resolveSheetDrag(
  expanded: boolean,
  deltaYPx: number,
  velocityPxPerMs: number,
): boolean {
  requireFinite('deltaYPx', deltaYPx);
  requireFinite('velocityPxPerMs', velocityPxPerMs);

  const direction = deltaYPx !== 0 ? deltaYPx : velocityPxPerMs;
  const decisive =
    Math.abs(deltaYPx) >= SHEET_DRAG_THRESHOLD_PX ||
    Math.abs(velocityPxPerMs) > SHEET_FLICK_PX_PER_MS;
  if (!decisive || direction === 0) {
    return expanded;
  }
  return direction < 0;
}
