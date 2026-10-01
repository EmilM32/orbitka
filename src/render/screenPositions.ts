import { Vector3, type Camera } from 'three';

export type ScreenBody = {
  id: string;
  type: string;
  position: { x: number; y: number; z: number };
};

export type BodyScreenPosition = {
  id: string;
  type: string;
  x: number;
  y: number;
  visible: boolean;
};

function requireSize(parameter: 'width' | 'height', value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(
      `getBodyScreenPositions: parameter "${parameter}" must be finite and > 0, got ${value}`,
    );
  }
}

export function getBodyScreenPositions(
  entries: readonly ScreenBody[],
  camera: Camera,
  width: number,
  height: number,
): BodyScreenPosition[] {
  requireSize('width', width);
  requireSize('height', height);

  const ndc = new Vector3();

  return entries.map((entry) => {
    ndc.set(entry.position.x, entry.position.y, entry.position.z);
    ndc.project(camera);
    const x = (ndc.x * 0.5 + 0.5) * width;
    const y = (-ndc.y * 0.5 + 0.5) * height;
    const visible = ndc.z <= 1 && x >= 0 && y >= 0 && x <= width && y <= height;

    return {
      id: entry.id,
      type: entry.type,
      x,
      y,
      visible,
    };
  });
}
