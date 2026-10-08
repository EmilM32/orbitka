import type { PerspectiveCamera } from 'three';

import type { ViewInsetsStore } from '@core/viewInsets.ts';

/** SPEC §6: the frame follows the card in the same 220 ms as the panel. */
export const VIEW_OFFSET_SMOOTHING_MS = 220;

export type ViewOffsetRig = {
  update(dtSeconds: number): void;
  resize(widthCss: number, heightCss: number): void;
  getOffset(out: { x: number; y: number }): { x: number; y: number };
  dispose(): void;
};

export type ViewOffsetRigOptions = {
  camera: PerspectiveCamera;
  insets: ViewInsetsStore;
  reducedMotion: {
    readonly matches: boolean;
    subscribe(listener: () => void): () => void;
  };
  widthCss: number;
  heightCss: number;
};

const SMOOTHING_SECONDS = VIEW_OFFSET_SMOOTHING_MS / 1000;

function easeOutCubic(t: number): number {
  const rest = 1 - t;
  return 1 - rest * rest * rest;
}

/**
 * The only place that moves the camera frame (ADR-009 annex). A positive x
 * shifts the picture left, a positive y shifts it up, so the selected body
 * sits in the middle of the area the card and the sheet leave free. Picking
 * and projection read the camera matrices, so they follow on their own.
 */
export function createViewOffsetRig(
  options: ViewOffsetRigOptions,
): ViewOffsetRig {
  const { camera, insets, reducedMotion } = options;
  let width = options.widthCss;
  let height = options.heightCss;
  let currentX = 0;
  let currentY = 0;
  let fromX = 0;
  let fromY = 0;
  let targetX = 0;
  let targetY = 0;
  let elapsed = SMOOTHING_SECONDS;
  // What the camera holds now, so stable frames touch nothing.
  let appliedX = 0;
  let appliedY = 0;
  let applied = false;
  let disposed = false;

  retarget();
  const unsubscribeInsets = insets.subscribe(retarget);
  const unsubscribeMotion = reducedMotion.subscribe(onMotionChange);

  return {
    update(dtSeconds: number): void {
      if (disposed) {
        return;
      }
      if (elapsed < SMOOTHING_SECONDS) {
        elapsed = Math.min(
          SMOOTHING_SECONDS,
          elapsed +
            (Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 0),
        );
        const eased = easeOutCubic(elapsed / SMOOTHING_SECONDS);
        currentX = fromX + (targetX - fromX) * eased;
        currentY = fromY + (targetY - fromY) * eased;
      }
      apply();
    },
    resize(widthCss: number, heightCss: number): void {
      if (disposed || !(widthCss > 0) || !(heightCss > 0)) {
        return;
      }
      width = widthCss;
      height = heightCss;
      // The renderer reset the aspect; the offset has to be written again.
      applied = false;
      retarget();
      apply();
    },
    getOffset(out) {
      out.x = currentX;
      out.y = currentY;
      return out;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      unsubscribeInsets();
      unsubscribeMotion();
      currentX = 0;
      currentY = 0;
      camera.clearViewOffset();
      applied = false;
    },
  };

  function retarget(): void {
    if (disposed) {
      return;
    }
    const covered = insets.get();
    const nextX = clampHalf(covered.right, width);
    const nextY = clampHalf(covered.bottom, height);
    if (nextX === targetX && nextY === targetY) {
      return;
    }
    targetX = nextX;
    targetY = nextY;
    if (reducedMotion.matches) {
      jump();
      return;
    }
    // Starts from where the frame is now, so a change mid-way does not jump.
    fromX = currentX;
    fromY = currentY;
    elapsed = 0;
  }

  function onMotionChange(): void {
    if (!disposed && reducedMotion.matches && elapsed < SMOOTHING_SECONDS) {
      jump();
    }
  }

  function jump(): void {
    currentX = targetX;
    currentY = targetY;
    elapsed = SMOOTHING_SECONDS;
    apply();
  }

  function apply(): void {
    if (currentX === 0 && currentY === 0) {
      if (applied) {
        camera.clearViewOffset();
        applied = false;
      }
      return;
    }
    if (applied && currentX === appliedX && currentY === appliedY) {
      return;
    }
    camera.setViewOffset(width, height, currentX, currentY, width, height);
    appliedX = currentX;
    appliedY = currentY;
    applied = true;
  }
}

/** Half of the inset, at most (size - 1) / 2 so the free area keeps 1 px. */
function clampHalf(inset: number, size: number): number {
  if (!(size > 0)) {
    return 0;
  }
  return Math.min(inset, size - 1) / 2;
}
