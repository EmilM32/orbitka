import { expect, test } from 'vitest';

import {
  captureOctantFrame,
  easeOutCubic,
  layerReveal,
  signedDistance,
  wedgeAngle,
  wedgeClipNormals,
  type CutawayVec3,
  type OctantFrame,
} from '@core/cutawayPlane.ts';

function vec(x: number, y: number, z: number): CutawayVec3 {
  return { x, y, z };
}

function frame(): OctantFrame {
  return { a: vec(0, 0, 0), b: vec(0, 0, 0), c: vec(0, 0, 0) };
}

function dot(p: CutawayVec3, q: CutawayVec3): number {
  return p.x * q.x + p.y * q.y + p.z * q.z;
}

function cross(p: CutawayVec3, q: CutawayVec3): CutawayVec3 {
  return vec(
    p.y * q.z - p.z * q.y,
    p.z * q.x - p.x * q.z,
    p.x * q.y - p.y * q.x,
  );
}

/** True when every plane through `center` puts `sample` on its clipped side. */
function clipped(
  normals: CutawayVec3[],
  center: CutawayVec3,
  sample: CutawayVec3,
): boolean {
  return normals.every((n) => signedDistance(n, center, sample) < 0);
}

function normals(): [CutawayVec3, CutawayVec3, CutawayVec3] {
  return [vec(0, 0, 0), vec(0, 0, 0), vec(0, 0, 0)];
}

test('cutawayPlane › the octant frame is right-handed and faces the camera', () => {
  const body = vec(2, 0, 0);
  const camera = vec(2, 1, 8);
  const out = frame();
  expect(captureOctantFrame(body, camera, vec(0, 1, 0), out)).toBe(true);

  const { a, b, c } = out;
  for (const axis of [a, b, c]) {
    expect(dot(axis, axis)).toBeCloseTo(1);
  }
  expect(dot(a, b)).toBeCloseTo(0);
  expect(dot(a, c)).toBeCloseTo(0);
  expect(dot(b, c)).toBeCloseTo(0);
  const axb = cross(a, b);
  expect(axb.x).toBeCloseTo(c.x);
  expect(axb.y).toBeCloseTo(c.y);
  expect(axb.z).toBeCloseTo(c.z);

  // The corner of the removed eighth points at the camera.
  const view = vec(camera.x - body.x, camera.y - body.y, camera.z - body.z);
  const length = Math.hypot(view.x, view.y, view.z);
  const corner = vec(a.x + b.x + c.x, a.y + b.y + c.y, a.z + b.z + c.z);
  expect(dot(corner, view) / length).toBeCloseTo(Math.sqrt(3));
  // The floor axis leans toward the camera's up.
  expect(c.y).toBeGreaterThan(0);
});

test('cutawayPlane › a degenerate camera gives no frame', () => {
  const out = frame();
  expect(
    captureOctantFrame(vec(1, 2, 3), vec(1, 2, 3), vec(0, 1, 0), out),
  ).toBe(false);
  expect(
    captureOctantFrame(vec(0, 0, 0), vec(0, 5, 0), vec(0, 1, 0), out),
  ).toBe(false);
});

test('cutawayPlane › the open wedge removes exactly the eighth facing the camera', () => {
  const body = vec(2, 0, 0);
  const camera = vec(2, 0, 8);
  const out = frame();
  captureOctantFrame(body, camera, vec(0, 1, 0), out);
  const planes = normals();
  wedgeClipNormals(out, Math.PI / 2, planes);

  const { a, b, c } = out;
  const at = (ka: number, kb: number, kc: number): CutawayVec3 =>
    vec(
      body.x + ka * a.x + kb * b.x + kc * c.x,
      body.y + ka * a.y + kb * b.y + kc * c.y,
      body.z + ka * a.z + kb * b.z + kc * c.z,
    );

  expect(clipped(planes, body, at(0.3, 0.3, 0.3))).toBe(true);
  expect(clipped(planes, body, camera)).toBe(true);
  expect(clipped(planes, body, at(-0.3, 0.3, 0.3))).toBe(false);
  expect(clipped(planes, body, at(0.3, -0.3, 0.3))).toBe(false);
  expect(clipped(planes, body, at(0.3, 0.3, -0.3))).toBe(false);
});

test('cutawayPlane › a half-open wedge removes only its slice', () => {
  const out: OctantFrame = {
    a: vec(1, 0, 0),
    b: vec(0, 1, 0),
    c: vec(0, 0, 1),
  };
  const center = vec(0, 0, 0);
  const planes = normals();
  wedgeClipNormals(out, Math.PI / 4, planes);
  const azimuth = (deg: number): CutawayVec3 => {
    const rad = (deg * Math.PI) / 180;
    return vec(Math.cos(rad), Math.sin(rad), 0.5);
  };
  expect(clipped(planes, center, azimuth(20))).toBe(true);
  expect(clipped(planes, center, azimuth(60))).toBe(false);
  expect(clipped(planes, center, azimuth(-10))).toBe(false);

  wedgeClipNormals(out, 0, planes);
  expect(clipped(planes, center, azimuth(20))).toBe(false);
  expect(() => wedgeClipNormals(out, Math.PI, planes)).toThrow(RangeError);
});

test('cutawayPlane › the wedge swings first, then layers come in from the outside', () => {
  expect(wedgeAngle(0)).toBe(0);
  expect(wedgeAngle(0.3)).toBeGreaterThan(0);
  expect(wedgeAngle(0.6)).toBeCloseTo(Math.PI / 2);
  expect(wedgeAngle(1)).toBeCloseTo(Math.PI / 2);
  expect(() => wedgeAngle(Number.NaN)).toThrow(RangeError);

  expect(layerReveal(0.2, 0, 3)).toBe(0);
  expect(layerReveal(0.5, 0, 3)).toBeGreaterThan(layerReveal(0.5, 2, 3));
  for (let index = 0; index < 3; index += 1) {
    expect(layerReveal(1, index, 3)).toBe(1);
  }
  expect(layerReveal(1, 0, 1)).toBe(1);
  expect(() => layerReveal(0.5, 3, 3)).toThrow(RangeError);
  expect(() => layerReveal(0.5, 0, 0)).toThrow(RangeError);
  expect(() => layerReveal(Number.NaN, 0, 1)).toThrow(RangeError);
});

test('cutawayPlane › easing', () => {
  expect(easeOutCubic(0)).toBe(0);
  expect(easeOutCubic(1)).toBe(1);
  expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  expect(() => easeOutCubic(Number.NaN)).toThrow(RangeError);
});
