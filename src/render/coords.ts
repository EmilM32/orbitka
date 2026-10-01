import type { Vector3 } from 'three';

import type { Vec3 } from '@sim/scale.ts';

// Ecliptic (x, y, z = north) → three.js (x, y = z, z = −y).
export function eclipticToScene(v: Vec3, out: Vector3): Vector3 {
  // -0 from the product −y breaks a comparison with zero; +0 stays zero.
  return out.set(v.x, v.z, -v.y || 0);
}
