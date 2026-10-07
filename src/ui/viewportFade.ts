import { CAMERA_CONFIG } from '@core/cameraConfig.ts';

type FadePlayer = {
  cancel(): void;
};

/** Enough of an element for `Element.animate`. Missing `animate` is a no-op. */
export type ViewportFadeTarget = {
  animate?(
    keyframes: Array<{ opacity: number }>,
    options: { duration: number },
  ): FadePlayer;
};

export type ViewportFade = {
  play(): void;
  dispose(): void;
};

export function createViewportFade(target: ViewportFadeTarget): ViewportFade {
  let player: FadePlayer | null = null;
  let disposed = false;

  return {
    play(): void {
      if (disposed || typeof target.animate !== 'function') {
        return;
      }

      player?.cancel();
      player = target.animate([{ opacity: 0.5 }, { opacity: 1 }], {
        duration: CAMERA_CONFIG.reducedMotionFadeMs,
      });
    },
    dispose(): void {
      if (disposed) {
        return;
      }

      disposed = true;
      player?.cancel();
      player = null;
    },
  };
}
