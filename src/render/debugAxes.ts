import { AxesHelper, type Material, type Mesh } from 'three';

import type { BodyDef } from '@data/types.ts';
import { radiusToScene } from '@sim/scale.ts';

function disposeMaterial(material: Material | Material[]): void {
  if (Array.isArray(material)) {
    for (const item of material) {
      item.dispose();
    }
    return;
  }

  material.dispose();
}

export function addDebugAxes(
  defs: readonly BodyDef[],
  meshes: ReadonlyMap<string, Mesh>,
): { dispose(): void } {
  const helpers: AxesHelper[] = [];

  for (const def of defs) {
    if (def.type !== 'star' && def.type !== 'planet') {
      continue;
    }

    const mesh = meshes.get(def.id);
    if (mesh === undefined) {
      throw new Error(`addDebugAxes: missing mesh for body "${def.id}"`);
    }

    const helper = new AxesHelper(2 * radiusToScene(def.radiusKm));
    mesh.add(helper);
    helpers.push(helper);
  }

  let disposed = false;

  return {
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      for (const helper of helpers) {
        helper.removeFromParent();
        helper.geometry.dispose();
        disposeMaterial(helper.material);
      }
    },
  };
}
