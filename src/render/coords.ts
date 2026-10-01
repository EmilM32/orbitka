import type { Vector3 } from 'three';

import type { Vec3 } from '@sim/scale.ts';

// Ekliptyka (x, y, z = północ) → three.js (x, y = z, z = −y).
export function eclipticToScene(v: Vec3, out: Vector3): Vector3 {
  // -0 z iloczynu −y psuje porównanie z zerem; +0 zostaje zerem.
  return out.set(v.x, v.z, -v.y || 0);
}
