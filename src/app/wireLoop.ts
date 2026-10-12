import { createLoop } from '@core/loop.ts';
import type { CameraControllerState } from '@render/cameraController.ts';
import type { CameraFlightSnapshot } from '@render/cameraDirector.ts';
import { zoomLimitState } from '@core/zoomLimits.ts';
import type { PlanetMotion } from '@render/forceArrows.ts';
import type { CutawayLabelPoint } from '@render/interiorCutaway.ts';

import type { DebugRig } from './wireDebug.ts';
import type { IntroRig } from './wireIntro.ts';
import type { OverlayRig } from './wireOverlays.ts';
import type { SceneRig } from './wireScene.ts';
import type { SelectionRig } from './wireSelection.ts';
import type { TimeRig } from './wireTime.ts';
import type { UiRig } from './wireUi.ts';
import type { ViewRig } from './wireView.ts';

const MOTION_REFRESH_SECONDS = 0.25;

export type LoopInputs = {
  /** The body a link asks for; it is selected once the first frame is drawn. */
  startBodyId: string | null;
  introRig: IntroRig;
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
  startBodyId,
  introRig,
  viewRig,
  sceneRig,
  selectionRig,
  timeRig,
  uiRig,
  overlayRig,
  debugRig,
}: LoopInputs) {
  const { view, frameRenderer, cameraController, size } = viewRig;
  const { quality, starfield, orbitLines, textureStore, cutaway } = sceneRig;
  const { gravityGrid, forceArrows } = sceneRig;
  const { director, viewOffset, projector, ring, gap } = selectionRig;
  const { announcer, labelProjector, labels } = overlayRig;
  let simDt = 0;
  // The pull and speed rows of the card change a few times a second, not
  // every frame (EMI-265).
  let motionWait = 0;
  const motion: PlanetMotion = { accelerationMs2: 0, speedKms: 0 };
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
  const layerPoint: CutawayLabelPoint = {
    anchorX: 0,
    anchorY: 0,
    centerX: 0,
    centerY: 0,
    radiusPx: 0,
  };
  const flightState: CameraFlightSnapshot = {
    active: 0,
    kind: 0,
    progress: 0,
  };

  const loop = createLoop({
    update(dtSeconds) {
      simDt = dtSeconds;
      // The first frame after a start or a resume has dt = 0: no sample.
      if (dtSeconds > 0) {
        quality.sampleFrame(dtSeconds, !document.hidden);
      }
      timeRig.update(dtSeconds);
      // After the planets moved: their funnels follow them.
      gravityGrid.update();
      director.update(dtSeconds);
      cameraController.update(dtSeconds);
      cutaway.update(
        dtSeconds,
        view.camera,
        director.getFlightState(flightState).active !== 0,
      );
      viewOffset.update(dtSeconds);
      // After the camera moved: the arrow width follows its distance.
      forceArrows.update(timeRig.clock.days, view.camera, size.height);
      motionWait -= dtSeconds;
      if (motionWait <= 0) {
        motionWait = MOTION_REFRESH_SECONDS;
        const shownId = uiRig.bodyCard.shownBodyId();
        uiRig.bodyCard.setMotion(
          shownId !== null && forceArrows.readMotion(shownId, motion)
            ? motion
            : null,
        );
      }
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
        // The intro starts on the first drawn frame (EMI-248).
        introRig.start();
        // Only through the selection (ADR-009), so the flight and the card follow.
        if (startBodyId !== null) {
          selectionRig.selection.select(startBodyId);
        }
      }
      if (size.width > 0 && size.height > 0) {
        projector.update(view.camera, size.width, size.height);
        labelProjector.update(view.camera, size.width, size.height);
        labels.update(size.width, size.height, simDt);
        uiRig.layerLabel.update(
          cutaway.readLabel(view.camera, size.width, size.height, layerPoint)
            ? layerPoint
            : null,
        );
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
