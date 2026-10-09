const MAX_PIXEL_RATIO = 2;
const COARSE_POINTER_MAX_PIXEL_RATIO = 1.5;

export function resolvePixelRatio(
  devicePixelRatio: number,
  coarsePointer: boolean,
  qualityCap: number = Number.POSITIVE_INFINITY,
): number {
  const capped = Math.min(devicePixelRatio, MAX_PIXEL_RATIO);
  const byPointer = coarsePointer
    ? Math.min(capped, COARSE_POINTER_MAX_PIXEL_RATIO)
    : capped;
  // The light quality level draws at most one pixel per CSS pixel.
  return Math.min(byPointer, qualityCap);
}
