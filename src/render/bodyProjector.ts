import { Vector3, type PerspectiveCamera } from 'three';

import {
  createBodyScreenFrame,
  sphereScreenRadiusPx,
  type BodyScreenFrame,
} from '@core/bodyScreenFrame.ts';

import type { ResizeListener, SceneView } from './createRenderer.ts';

/** Live scene position and the rendered sphere radius. */
export type ProjectorEntry = {
  id: string;
  position: { x: number; y: number; z: number };
  displayRadius: number;
};

export type BodyProjector = {
  frame: BodyScreenFrame;
  update(camera: PerspectiveCamera, widthCss: number, heightCss: number): void;
  dispose(): void;
};

const world = new Vector3();
const ndc = new Vector3();

/**
 * Writes one screen frame for hit testing and the DOM ring.
 * Canvas size comes from `sceneView.onResize` once that has fired.
 * `update` does not read layout.
 */
export function createBodyProjector(
  entries: readonly ProjectorEntry[],
  sceneView: Pick<SceneView, 'onResize'>,
): BodyProjector {
  const ids: string[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    ids.push(entries[index]?.id ?? '');
  }
  const frame = createBodyScreenFrame(ids);
  let cachedWidth = 0;
  let cachedHeight = 0;
  let disposed = false;

  const onResize: ResizeListener = (width, height) => {
    if (width > 0 && height > 0) {
      cachedWidth = width;
      cachedHeight = height;
    }
  };
  const unsubscribe = sceneView.onResize(onResize);

  return {
    frame,
    update(camera, widthCss, heightCss): void {
      if (disposed || !(widthCss > 0) || !(heightCss > 0)) {
        return;
      }

      const width = cachedWidth > 0 ? cachedWidth : widthCss;
      const height = cachedHeight > 0 ? cachedHeight : heightCss;
      camera.updateMatrixWorld();
      const halfAngle = Math.tan((camera.fov * Math.PI) / 360);
      const focalPx = halfAngle > 0 ? height / 2 / halfAngle : 0;
      const fallbackPx = Math.hypot(width, height);

      for (let index = 0; index < frame.count; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
          continue;
        }

        world.set(entry.position.x, entry.position.y, entry.position.z);
        ndc.copy(world);
        ndc.applyMatrix4(camera.matrixWorldInverse);
        const depth = -ndc.z;
        const lateral = Math.hypot(ndc.x, ndc.y);
        ndc.copy(world);
        ndc.project(camera);

        const x = (ndc.x * 0.5 + 0.5) * width;
        const y = (-ndc.y * 0.5 + 0.5) * height;
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(depth)
        ) {
          frame.x[index] = 0;
          frame.y[index] = 0;
          frame.depth[index] = 0;
          frame.radiusPx[index] = 0;
          frame.visible[index] = 0;
          continue;
        }

        frame.x[index] = x;
        frame.y[index] = y;
        frame.depth[index] = depth;
        frame.radiusPx[index] = sphereScreenRadiusPx(
          entry.displayRadius,
          lateral,
          depth,
          focalPx,
          fallbackPx,
        );
        const onScreen = x >= 0 && y >= 0 && x <= width && y <= height;
        frame.visible[index] = depth > 0 && ndc.z <= 1 && onScreen ? 1 : 0;
      }
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      unsubscribe();
    },
  };
}
