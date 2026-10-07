/** Screen-space body slots. Allocated once; callers write into the arrays. */
export type BodyScreenFrame = {
  count: number;
  ids: readonly string[];
  x: Float64Array;
  y: Float64Array;
  depth: Float64Array;
  radiusPx: Float64Array;
  visible: Uint8Array;
};

export function createBodyScreenFrame(ids: readonly string[]): BodyScreenFrame {
  const count = ids.length;
  const owned: string[] = [];
  for (let index = 0; index < count; index += 1) {
    owned.push(ids[index] ?? '');
  }

  return {
    count,
    ids: owned,
    x: new Float64Array(count),
    y: new Float64Array(count),
    depth: new Float64Array(count),
    radiusPx: new Float64Array(count),
    visible: new Uint8Array(count),
  };
}

/**
 * Screen radius of a sphere's outline around its projected centre, in CSS px:
 * the farthest outline point from that centre. A circle of this radius
 * always covers the drawn disc, close up and off axis. On the view axis it
 * is `focalPx · tan(asin(radius / distance))`.
 *
 * `lateral` and `depth` are the centre's camera-space offset from the view
 * axis and its depth; `focalPx` is `(heightPx / 2) / tan(fov / 2)`. When the
 * outline reaches the camera plane it is unbounded and `fallbackPx` is
 * returned.
 */
export function sphereScreenRadiusPx(
  radius: number,
  lateral: number,
  depth: number,
  focalPx: number,
  fallbackPx: number,
): number {
  if (!(radius > 0) || !(depth > 0) || !(focalPx > 0) || !(lateral >= 0)) {
    return 0;
  }

  const distanceSquared = lateral * lateral + depth * depth;
  const tangentSquared = distanceSquared - radius * radius;
  if (!(tangentSquared > 0)) {
    return fallbackPx;
  }

  // Far outline edge: f · (tan(θ + α) − tan θ), θ off axis, α = asin(r / d).
  const denominator = depth * Math.sqrt(tangentSquared) - lateral * radius;
  if (!(denominator > 0)) {
    return fallbackPx;
  }

  const result = (focalPx * radius * distanceSquared) / (depth * denominator);
  return Number.isFinite(result) ? Math.min(result, fallbackPx) : fallbackPx;
}
