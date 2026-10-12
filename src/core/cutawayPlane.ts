// The octant cutaway (EMI-263, EMI-266). Pure: no three.js. One eighth of
// the body is removed. The frame axes `a`, `b`, `c` bound that eighth; its
// corner direction (a + b + c) points at the camera when the cut opens.
// After that the frame stays put and only follows the body.

export type CutawayVec3 = {
  x: number;
  y: number;
  z: number;
};

export type OctantFrame = {
  a: CutawayVec3;
  b: CutawayVec3;
  c: CutawayVec3;
};

// The whole opening when motion is allowed: the wedge, then the layers.
export const CUTAWAY_OPEN_SECONDS = 1.1;
// Share of the opening spent on swinging the wedge to 90°.
export const CUTAWAY_WEDGE_SHARE = 0.6;
// Layer colors come in from the outside one after another.
export const CUTAWAY_LAYER_START = 0.35;
export const CUTAWAY_LAYER_SHARE = 0.3;
// The outer face sits this far inside the shell so the limb stays visible.
export const CUTAWAY_RIM_INSET = 0.008;
// Faces sit this far into the removed eighth, in fractions of the radius,
// so the shell's back faces do not show through at the cut.
export const CUTAWAY_FACE_OFFSET = 0.003;

const INV_SQRT2 = 1 / Math.SQRT2;
const INV_SQRT3 = 1 / Math.sqrt(3);
const INV_SQRT6 = 1 / Math.sqrt(6);
const SQRT_TWO_THIRDS = Math.sqrt(2 / 3);

function normalize(v: CutawayVec3): number {
  const length = Math.hypot(v.x, v.y, v.z);
  if (!(length > 0) || !Number.isFinite(length)) {
    return 0;
  }
  v.x /= length;
  v.y /= length;
  v.z /= length;
  return length;
}

function dot(p: CutawayVec3, q: CutawayVec3): number {
  return p.x * q.x + p.y * q.y + p.z * q.z;
}

function combine(
  out: CutawayVec3,
  r: CutawayVec3,
  u: CutawayVec3,
  v: CutawayVec3,
  kr: number,
  ku: number,
  kv: number,
): void {
  out.x = kr * r.x + ku * u.x + kv * v.x;
  out.y = kr * r.y + ku * u.y + kv * v.y;
  out.z = kr * r.z + ku * u.z + kv * v.z;
}

/**
 * Aims the removed eighth at the camera. `c` leans toward the camera's up,
 * so the bottom face of the opening is seen from above. Returns false when
 * the camera sits on the body or looks along its own up vector.
 */
export function captureOctantFrame(
  body: CutawayVec3,
  camera: CutawayVec3,
  cameraUp: CutawayVec3,
  out: OctantFrame,
): boolean {
  const view = {
    x: camera.x - body.x,
    y: camera.y - body.y,
    z: camera.z - body.z,
  };
  if (normalize(view) === 0) {
    return false;
  }
  const along = dot(cameraUp, view);
  const up = {
    x: cameraUp.x - view.x * along,
    y: cameraUp.y - view.y * along,
    z: cameraUp.z - view.z * along,
  };
  if (normalize(up) < 1e-6) {
    return false;
  }
  const right = {
    x: up.y * view.z - up.z * view.y,
    y: up.z * view.x - up.x * view.z,
    z: up.x * view.y - up.y * view.x,
  };

  combine(out.a, right, up, view, -INV_SQRT2, -INV_SQRT6, INV_SQRT3);
  combine(out.b, right, up, view, INV_SQRT2, -INV_SQRT6, INV_SQRT3);
  combine(out.c, right, up, view, 0, SQRT_TWO_THIRDS, INV_SQRT3);
  return true;
}

/**
 * The wedge angle around `c`, from 0 (whole body) to π/2 (one eighth gone).
 * `progress` runs over the whole opening.
 */
export function wedgeAngle(progress: number): number {
  if (!Number.isFinite(progress)) {
    throw new RangeError(
      `wedgeAngle: parameter "progress" must be finite, got ${progress}`,
    );
  }
  return (Math.PI / 2) * easeOutCubic(progress / CUTAWAY_WEDGE_SHARE);
}

/** How far layer `index` (0 is the outside) has taken its color, 0 to 1. */
export function layerReveal(
  progress: number,
  index: number,
  count: number,
): number {
  if (!Number.isFinite(progress)) {
    throw new RangeError(
      `layerReveal: parameter "progress" must be finite, got ${progress}`,
    );
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(
      `layerReveal: parameter "count" must be an integer >= 1, got ${count}`,
    );
  }
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new RangeError(
      `layerReveal: parameter "index" must be an integer in [0, ${count}), got ${index}`,
    );
  }
  const step =
    count === 1
      ? 0
      : (1 - CUTAWAY_LAYER_START - CUTAWAY_LAYER_SHARE) / (count - 1);
  const start = CUTAWAY_LAYER_START + index * step;
  return easeOutCubic((progress - start) / CUTAWAY_LAYER_SHARE);
}

/**
 * Normals of the three clipping planes through the body center, in the
 * convention where the negative side is clipped. With the planes clipping
 * only where all three agree, the removed part is the wedge from azimuth 0
 * (along `a`) to `angle` around `c`, on the `c` side of the `a`-`b` plane.
 */
export function wedgeClipNormals(
  frame: OctantFrame,
  angle: number,
  out: [CutawayVec3, CutawayVec3, CutawayVec3],
): void {
  if (!Number.isFinite(angle) || angle < 0 || angle > Math.PI / 2) {
    throw new RangeError(
      `wedgeClipNormals: parameter "angle" must be in [0, π/2], got ${angle}`,
    );
  }
  const { a, b, c } = frame;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const [first, second, third] = out;
  // Removed where x·b ≥ 0, x·(sin·a − cos·b) ≥ 0 and x·c ≥ 0.
  first.x = -b.x;
  first.y = -b.y;
  first.z = -b.z;
  second.x = -(sin * a.x - cos * b.x);
  second.y = -(sin * a.y - cos * b.y);
  second.z = -(sin * a.z - cos * b.z);
  third.x = -c.x;
  third.y = -c.y;
  third.z = -c.z;
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

// A highlighted layer eases in and out over this time (EMI-267).
export const CUTAWAY_HIGHLIGHT_SECONDS = 0.15;

/** Moves `current` toward `target` by at most `dtSeconds / seconds`. */
export function stepToward(
  current: number,
  target: number,
  dtSeconds: number,
  seconds: number,
): number {
  if (!Number.isFinite(dtSeconds) || dtSeconds < 0) {
    throw new RangeError(
      `stepToward: parameter "dtSeconds" must be finite and >= 0, got ${dtSeconds}`,
    );
  }
  if (!(seconds > 0) || !Number.isFinite(seconds)) {
    throw new RangeError(
      `stepToward: parameter "seconds" must be finite and > 0, got ${seconds}`,
    );
  }
  const step = dtSeconds / seconds;
  if (Math.abs(target - current) <= step) {
    return target;
  }
  return current + Math.sign(target - current) * step;
}
