import { expect, test } from 'vitest';

import { bodies } from '@data/bodies.ts';
import { createBodies } from '@render/bodies.ts';
import { getBodyScenePosition } from '@render/scenePosition.ts';

test('bodyScenePosition › id', () => {
  const view = createBodies(bodies);
  const earth = view.meshes.get('earth');
  if (earth === undefined) {
    view.dispose();
    throw new Error('missing earth mesh');
  }

  earth.position.set(1.5, -2.25, 3.5);

  try {
    expect(view.meshes.size).toBe(bodies.length);

    for (const body of bodies) {
      const mesh = view.meshes.get(body.id);
      expect(mesh, body.id).toBeDefined();
      if (mesh === undefined) {
        continue;
      }

      const position = getBodyScenePosition(view.meshes, body.id);
      expect(position, body.id).toEqual({
        x: mesh.position.x,
        y: mesh.position.y,
        z: mesh.position.z,
      });
      expect(position).not.toBe(mesh.position);
      expect(Number.isFinite(position?.x)).toBe(true);
      expect(Number.isFinite(position?.y)).toBe(true);
      expect(Number.isFinite(position?.z)).toBe(true);
    }

    const read = getBodyScenePosition(view.meshes, 'earth');
    expect(read).toEqual({ x: 1.5, y: -2.25, z: 3.5 });
    if (read !== null) {
      read.x = 99;
    }
    expect(earth.position.x).toBe(1.5);
    expect(getBodyScenePosition(view.meshes, 'earth')?.x).toBe(1.5);
    expect(getBodyScenePosition(view.meshes, 'nieznane')).toBeNull();
  } finally {
    view.dispose();
  }
});
