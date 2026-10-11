import { createCoachTracker } from '@core/coach.ts';
import { bodies } from '@data/bodies.ts';
import { createBodyProjector } from '@render/bodyProjector.ts';
import { createAnnouncer } from '@ui/announcer.ts';
import { createBodyLabels } from '@ui/bodyLabels.ts';
import { createCoachPanel, type CoachPanel } from '@ui/coachPanel.ts';
import { loadCoachDone, type CoachStorages } from '@ui/coachPreference.ts';
import { createLabelObstacles } from '@ui/labelObstacles.ts';
import { createLayoutObserver } from '@ui/layoutObserver.ts';

import { createDisposables } from './disposables.ts';
import type { AppI18n } from './types.ts';
import type { SceneRig } from './wireScene.ts';
import type { SelectionRig } from './wireSelection.ts';
import type { UiRig } from './wireUi.ts';
import type { ViewRig } from './wireView.ts';

export type OverlayInputs = {
  i18n: AppI18n;
  viewRig: ViewRig;
  sceneRig: SceneRig;
  selectionRig: SelectionRig;
  uiRig: UiRig;
};

/** The pilot training, the live announcements and the labels in the scene. */
export function wireOverlays({
  i18n,
  viewRig,
  sceneRig,
  selectionRig,
  uiRig,
}: OverlayInputs) {
  const { view, cameraController, reducedMotion } = viewRig;
  const { bodyView } = sceneRig;
  const { selection, viewInsets } = selectionRig;
  const stack = createDisposables();
  // "Trening pilota" runs until it is finished or skipped once.
  const coachStorage: CoachStorages = {
    local: () => window.localStorage,
    session: () => window.sessionStorage,
    memory: { done: false },
  };
  let coachPanel: CoachPanel | null = null;
  if (!loadCoachDone(coachStorage)) {
    const coach = createCoachTracker();
    stack.add(
      cameraController.onCameraInput((input) => {
        coach.onCameraInput(input);
      }),
    );
    stack.add(
      selection.subscribe((event) => {
        if (event.kind === 'selected') {
          coach.onSelected();
        }
      }),
    );
    const panel = createCoachPanel(document.body, {
      tracker: coach,
      i18n,
      storage: coachStorage,
      insets: viewInsets,
      isTablet: () => uiRig.tabletQuery.matches,
      leftEdge: () => uiRig.bodiesPanel.element.getBoundingClientRect().right,
      matchMedia: window.matchMedia.bind(window),
      reducedMotion,
    });
    coachPanel = panel;
    stack.add(() => {
      panel.dispose();
    });
  }
  const timePanel = document.querySelector('#time-controls');
  if (!(timePanel instanceof HTMLElement)) {
    stack.disposeAll();
    throw new Error('Missing time controls element #time-controls');
  }
  const layoutObserver = createLayoutObserver({
    target: timePanel,
    root: document.documentElement,
  });
  stack.add(() => {
    layoutObserver.dispose();
  });
  const announcer = createAnnouncer(document.body, selection, i18n);
  stack.add(() => {
    announcer.dispose();
  });
  // Scene labels stay off the panels (EMI-234).
  const labelObstacles = createLabelObstacles({
    root: document.body,
    elements: () => [
      uiRig.pageHeader,
      // On a tablet the chip wraps to a second row outside the header box.
      document.getElementById('scale-notice'),
      uiRig.bodiesDrawer.openButton,
      uiRig.bodiesPanel.element,
      uiRig.viewControls.element,
      uiRig.bodyCard.element,
      timePanel,
      coachPanel?.element,
    ],
  });
  stack.add(() => {
    labelObstacles.dispose();
  });
  // Labels also cover the moons, which are not selectable, so they get a
  // frame of their own: the picker and the ring keep the selectable bodies.
  const labelBodies = [];
  const labelEntries = [];
  for (const body of bodies) {
    const mesh = bodyView.meshes.get(body.id);
    const radius = bodyView.radii.get(body.id);
    if (mesh === undefined || radius === undefined) {
      continue;
    }
    labelEntries.push({
      id: body.id,
      position: mesh.position,
      displayRadius: radius,
    });
    labelBodies.push({
      id: body.id,
      radiusKm: body.radiusKm,
      parentId: body.parentId,
      color: body.visual.color,
    });
  }
  const labelProjector = createBodyProjector(labelEntries, view);
  stack.add(() => {
    labelProjector.dispose();
  });
  const labels = createBodyLabels(document.body, {
    bodies: labelBodies,
    selection,
    i18n,
    frame: labelProjector.frame,
    obstacles: labelObstacles,
  });
  stack.add(() => {
    labels.dispose();
  });

  return { announcer, labelProjector, labels, dispose: stack.disposeAll };
}

export type OverlayRig = ReturnType<typeof wireOverlays>;
