// The cutaway plane (EMI-263). Pure: no three.js. The normal points from the
// camera through the body, so the camera side is the half that is removed.
// After the cut opens, the normal stays put and only the point follows the body.

export type CutawayVec3 = {
  x: number;
  y: number;
  z: number;
};

// How long the opening sweep takes when motion is allowed.
export const CUTAWAY_OPEN_SECONDS = 0.45;
// The outer disc sits this far inside the shell so the limb stays visible.
export const CUTAWAY_RIM_INSET = 0.008;
// Disc stack toward the camera, in fractions of the scene radius.
export const CUTAWAY_DISC_OFFSET = 0.004;
export const CUTAWAY_DISC_STEP = 0.001;

export function captureCutNormal(
  body: CutawayVec3,
  camera: CutawayVec3,
  out: CutawayVec3,
): boolean {
  const x = body.x - camera.x;
  const y = body.y - camera.y;
  const z = body.z - camera.z;
  const length = Math.hypot(x, y, z);
  if (!(length > 0) || !Number.isFinite(length)) {
    return false;
  }

  out.x = x / length;
  out.y = y / length;
  out.z = z / length;
  return true;
}

/**
 * A point on the plane. `progress` 0 is the tangent on the camera side
 * (the whole body stays). `progress` 1 runs through the center.
 */
export function cutPlanePoint(
  body: CutawayVec3,
  normal: CutawayVec3,
  radius: number,
  progress: number,
  out: CutawayVec3,
): void {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new RangeError(
      `cutPlanePoint: parameter "radius" must be finite and > 0, got ${radius}`,
    );
  }
  if (!Number.isFinite(progress)) {
    throw new RangeError(
      `cutPlanePoint: parameter "progress" must be finite, got ${progress}`,
    );
  }

  const t = Math.min(1, Math.max(0, progress));
  const shift = radius * (1 - t);
  out.x = body.x - normal.x * shift;
  out.y = body.y - normal.y * shift;
  out.z = body.z - normal.z * shift;
}

/** Signed distance from the plane. Negative is the clipped side. */
export function signedDistance(
  normal: CutawayVec3,
  planePoint: CutawayVec3,
  sample: CutawayVec3,
): number {
  return (
    normal.x * (sample.x - planePoint.x) +
    normal.y * (sample.y - planePoint.y) +
    normal.z * (sample.z - planePoint.z)
  );
}

export function easeOutCubic(t: number): number {
  if (!Number.isFinite(t)) {
    throw new RangeError(
      `easeOutCubic: parameter "t" must be finite, got ${t}`,
    );
  }
  const clamped = Math.min(1, Math.max(0, t));
  const remaining = 1 - clamped;
  return 1 - remaining * remaining * remaining;
}

/**
 * Local Z of a disc when the group's +Z is the keep normal.
 * Negative is toward the camera. Outer layers sit in front of inner ones.
 */
export function layerDiscOffset(
  index: number,
  count: number,
  radius: number,
): number {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(
      `layerDiscOffset: parameter "count" must be an integer >= 1, got ${count}`,
    );
  }
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new RangeError(
      `layerDiscOffset: parameter "index" must be an integer in [0, ${count}), got ${index}`,
    );
  }
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new RangeError(
      `layerDiscOffset: parameter "radius" must be finite and > 0, got ${radius}`,
    );
  }

  return (
    -(CUTAWAY_DISC_OFFSET + (count - 1 - index) * CUTAWAY_DISC_STEP) * radius
  );
}
