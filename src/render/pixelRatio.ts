const MAX_PIXEL_RATIO = 2;
const COARSE_POINTER_MAX_PIXEL_RATIO = 1.5;

export function resolvePixelRatio(
  devicePixelRatio: number,
  coarsePointer: boolean,
): number {
  const capped = Math.min(devicePixelRatio, MAX_PIXEL_RATIO);
  return coarsePointer
    ? Math.min(capped, COARSE_POINTER_MAX_PIXEL_RATIO)
    : capped;
}
