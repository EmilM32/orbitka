import { createLoop } from '@core/loop.ts';
import type { CameraControllerState } from '@render/cameraController.ts';
import { zoomLimitState } from '@core/zoomLimits.ts';

import type { DebugRig } from './wireDebug.ts';
import type { OverlayRig } from './wireOverlays.ts';
import type { SceneRig } from './wireScene.ts';
import type { SelectionRig } from './wireSelection.ts';
import type { TimeRig } from './wireTime.ts';
import type { UiRig } from './wireUi.ts';
import type { ViewRig } from './wireView.ts';

export type LoopInputs = {
  viewRig: ViewRig;
  sceneRig: SceneRig;
  selectionRig: SelectionRig;
  timeRig: TimeRig;
  uiRig: UiRig;
  overlayRig: OverlayRig;
  debugRig: DebugRig;
};

/** The one loop: update(dt), then render(). It starts when the tab is visible. */
export function wireLoop({
  viewRig,
  sceneRig,
  selectionRig,
  timeRig,
  uiRig,
  overlayRig,
  debugRig,
}: LoopInputs) {
  const { view, frameRenderer, cameraController, size } = viewRig;
  const { quality, starfield, orbitLines, textureStore } = sceneRig;
  const { director, viewOffset, projector, ring, gap } = selectionRig;
  const { announcer, labelProjector, labels } = overlayRig;
  let simDt = 0;
  let timeReady = false;
  // Shared per-frame objects: the loop reads the zoom limits without
  // allocating.
  const zoomCamera: CameraControllerState = {
    azimuthDeg: 0,
    polarDeg: 0,
    distance: 1,
    distanceMin: 1,
    distanceMax: 1,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  };
  const zoomLimits = { atMin: false, atMax: false };

  const loop = createLoop({
    update(dtSeconds) {
      simDt = dtSeconds;
      // The first frame after a start or a resume has dt = 0: no sample.
      if (dtSeconds > 0) {
        quality.sampleFrame(dtSeconds, !document.hidden);
      }
      timeRig.update(dtSeconds);
      director.update(dtSeconds);
      cameraController.update(dtSeconds);
      viewOffset.update(dtSeconds);
      starfield.update(view.camera);
      orbitLines.setGap(gap.mesh?.position ?? null, gap.radius, view.camera);
      cameraController.getState(zoomCamera);
      zoomLimitState(
        zoomCamera.distance,
        zoomCamera.distanceMin,
        zoomCamera.distanceMax,
        zoomLimits,
      );
      uiRig.viewControls.setZoomLimits(zoomLimits.atMin, zoomLimits.atMax);
      announcer.update(dtSeconds);
      debugRig.afterUpdate();
    },
    render() {
      view.syncPixelRatio();
      debugRig.beginFrame();
      frameRenderer.render();
      if (!timeReady) {
        // The first frame is on screen: the time controls take input.
        timeReady = true;
        uiRig.timeControls.setReady(true);
        // Textures load after the first frame, so the start is not delayed.
        textureStore.preloadBase();
      }
      if (size.width > 0 && size.height > 0) {
        projector.update(view.camera, size.width, size.height);
        labelProjector.update(view.camera, size.width, size.height);
        labels.update(size.width, size.height, simDt);
      }
      ring.update(simDt);
      debugRig.afterRender();
    },
    requestFrame: view.requestFrame,
    cancelFrame: view.cancelFrame,
  });

  const onVisibilityChange = (): void => {
    if (document.hidden) {
      // A hidden tab ends the window and the warmup; both start over on return.
      quality.sampleFrame(0, false);
      loop.stop();
    } else {
      loop.start();
    }
  };

  // The level for the next session is saved when the page goes away.
  const onPageHide = (): void => {
    quality.flush();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);

  if (!document.hidden) {
    loop.start();
  }

  return {
    dispose(): void {
      loop.stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    },
  };
}
