import { BufferGeometry, Vector3, type Camera, type Object3D } from 'three';

export type OrbitExtent = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/**
 * Debug hook helper: the box the points of an orbit line cover on screen, in
 * CSS px of the window, or null when `object` is not a line with points.
 */
export function projectedOrbitExtent(
  object: Object3D | undefined,
  camera: Camera,
  width: number,
  height: number,
): OrbitExtent | null {
  const geometry = (object as { geometry?: unknown } | undefined)?.geometry;
  if (!(geometry instanceof BufferGeometry)) {
    return null;
  }
  const position = geometry.getAttribute('position');
  camera.updateMatrixWorld();
  const point = new Vector3();
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (let index = 0; index < position.count; index += 1) {
    point
      .set(position.getX(index), position.getY(index), position.getZ(index))
      .project(camera);
    const x = ((point.x + 1) / 2) * width;
    const y = ((1 - point.y) / 2) * height;
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }

  return { left, right, top, bottom };
}
