import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import { centeredFreeShares } from '@core/cameraMath.ts';
import { bodies } from '@data/bodies.ts';
import { distanceToScene } from '@sim/scale.ts';

import { createDisposables } from './disposables.ts';
import type { UiRig } from './wireUi.ts';
import type { ViewRig } from './wireView.ts';

// The panel margin from the window edge (--edge in tokens.css, 1rem).
const EDGE_PX = 16;
// Shares closer than this are the same frame: no camera nudge for a pixel.
const SHARE_EPSILON = 0.002;

// Scene radius of the outermost planet orbit.
function outermostOrbitRadius(): number {
  let axisAu = 0;
  for (const body of bodies) {
    if (body.type === 'planet' && body.orbit !== undefined) {
      axisAu = Math.max(axisAu, body.orbit.semiMajorAxisAu);
    }
  }
  return distanceToScene(axisAu);
}

/**
 * Tells the camera how much of the window the panels leave free, so the start
 * view and the system view show the whole system as large as the free area
 * allows (EMI-241). The free area comes from the panels' own boxes (top bar,
 * list, time panel), measured again when any of them or the window resizes.
 */
export function wireStartFrame(viewRig: ViewRig, uiRig: UiRig) {
  const { view, size, cameraController } = viewRig;
  const found = document.querySelector('#time-controls');
  if (!(found instanceof HTMLElement)) {
    throw new Error('Missing time controls element #time-controls');
  }
  const timePanel: HTMLElement = found;
  const stack = createDisposables();
  const orbitRadius = outermostOrbitRadius();
  const topBarElements = [uiRig.pageHeader, uiRig.viewControls.element];
  let listRight = 0;
  let lastWidthShare = Number.NaN;
  let lastHeightShare = Number.NaN;

  function measure(): void {
    let top = 0;
    for (const element of topBarElements) {
      top = Math.max(top, element.getBoundingClientRect().bottom);
    }
    const bottom = Math.max(
      0,
      size.height - timePanel.getBoundingClientRect().top,
    );
    // The list is docked only on a wide window. In rail mode (a body is
    // selected) the list keeps the width it had, so selecting does not move
    // the start view.
    let left = EDGE_PX;
    if (!uiRig.tabletQuery.matches) {
      const panel = uiRig.bodiesPanel;
      const right = panel.element.getBoundingClientRect().right;
      if (panel.getMode() === 'list' || listRight === 0) {
        listRight = right;
      }
      left = Math.max(left, listRight);
    }
    const shares = centeredFreeShares(size.width, size.height, {
      left,
      top,
      right: EDGE_PX,
      bottom,
    });
    if (shares === null) {
      return;
    }
    if (
      Math.abs(shares.widthShare - lastWidthShare) < SHARE_EPSILON &&
      Math.abs(shares.heightShare - lastHeightShare) < SHARE_EPSILON
    ) {
      return;
    }
    lastWidthShare = shares.widthShare;
    lastHeightShare = shares.heightShare;
    cameraController.setStartFrame({
      orbitRadius,
      fovDeg: view.camera.fov,
      widthShare: shares.widthShare,
      heightShare: shares.heightShare,
      fill: CAMERA_CONFIG.startFrameFill,
    });
  }

  stack.add(
    view.onResize(() => {
      measure();
    }),
  );
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      measure();
    });
    for (const element of [
      timePanel,
      uiRig.bodiesPanel.element,
      ...topBarElements,
    ]) {
      observer.observe(element);
    }
    stack.add(() => {
      observer.disconnect();
    });
  }
  measure();

  return { measure, dispose: stack.disposeAll };
}

export type StartFrameRig = ReturnType<typeof wireStartFrame>;
