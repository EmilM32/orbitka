import { getSelectableBodies } from '@core/selectableBodies.ts';
import { createSelection } from '@core/selection.ts';
import { createViewInsets } from '@core/viewInsets.ts';
import { bodies } from '@data/bodies.ts';
import { radiusToScene } from '@sim/scale.ts';
import { createBodyPicker } from '@render/bodyPicker.ts';
import { createBodyProjector } from '@render/bodyProjector.ts';
import { createCameraDirector } from '@render/cameraDirector.ts';
import { createViewOffsetRig } from '@render/viewOffset.ts';
import { createSelectionRing } from '@ui/selectionRing.ts';
import { createViewportFade } from '@ui/viewportFade.ts';

import { createDisposables } from './disposables.ts';
import type { SceneRig } from './wireScene.ts';
import type { ViewRig } from './wireView.ts';

type BodyMesh = NonNullable<ReturnType<SceneRig['bodyView']['meshes']['get']>>;

/** What is selected, how the camera flies to it and how it is picked. */
export function wireSelection(
  canvas: HTMLCanvasElement,
  viewRig: ViewRig,
  sceneRig: SceneRig,
) {
  const { view, size, reducedMotion, cameraController, pointerInput } = viewRig;
  const { bodyView, orbitLines, textureStore } = sceneRig;
  const stack = createDisposables();
  const selectable = getSelectableBodies(bodies);
  const selection = createSelection(selectable.map((body) => body.id));
  stack.add(() => {
    selection.dispose();
  });
  const projectorEntries = [];
  const directorBodies = [];
  for (const body of selectable) {
    const mesh = bodyView.meshes.get(body.id);
    if (mesh === undefined) {
      continue;
    }
    const displayRadius = radiusToScene(body.radiusKm);
    const framingRadius = bodyView.rings.get(body.id)?.framingRadius;
    projectorEntries.push({
      id: body.id,
      position: mesh.position,
      displayRadius,
      framingRadius,
    });
    directorBodies.push({
      id: body.id,
      object: mesh,
      displayRadius,
      framingRadius,
      isSun: body.type === 'star',
    });
  }
  const viewportFade = createViewportFade(canvas);
  stack.add(() => {
    viewportFade.dispose();
  });
  const viewInsets = createViewInsets();
  const viewOffset = createViewOffsetRig({
    camera: view.camera,
    insets: viewInsets,
    reducedMotion,
    widthCss: size.width,
    heightCss: size.height,
  });
  stack.add(() => {
    viewOffset.dispose();
  });
  stack.add(
    view.onResize((width, height) => {
      viewOffset.resize(width, height);
    }),
  );
  const director = createCameraDirector({
    controller: cameraController,
    selection,
    bodies: directorBodies,
    reducedMotion,
    onJump() {
      viewportFade.play();
    },
    insets: viewInsets,
    viewport: {
      get width() {
        return size.width;
      },
      get height() {
        return size.height;
      },
    },
  });
  stack.add(() => {
    director.dispose();
  });
  const projector = createBodyProjector(projectorEntries, view);
  stack.add(() => {
    projector.dispose();
  });
  const picker = createBodyPicker({
    surface: canvas,
    frame: projector.frame,
    selection,
    pointerInput,
  });
  stack.add(() => {
    picker.dispose();
  });
  const ring = createSelectionRing(document.body, {
    selection,
    frame: projector.frame,
  });
  stack.add(() => {
    ring.dispose();
  });
  // The selected body the orbit lines leave a gap around (mesh null = none).
  const gap: { mesh: BodyMesh | null; radius: number } = {
    mesh: null,
    radius: 0,
  };
  stack.add(
    selection.subscribe((event) => {
      if (event.kind === 'hover') {
        orbitLines.setHoveredBody(event.id);
        return;
      }
      if (event.kind === 'selected') {
        orbitLines.setSelectedBody(event.id);
        gap.mesh = bodyView.meshes.get(event.id) ?? null;
        gap.radius =
          gap.mesh === null ? 0 : (bodyView.radii.get(event.id) ?? 0);
        textureStore.requestDetailed(event.id);
        return;
      }
      if (event.kind === 'system') {
        orbitLines.setSelectedBody(null);
        gap.mesh = null;
        gap.radius = 0;
      }
    }),
  );

  return {
    selection,
    selectable,
    viewInsets,
    viewOffset,
    director,
    directorBodies,
    projector,
    ring,
    gap,
    dispose: stack.disposeAll,
  };
}

export type SelectionRig = ReturnType<typeof wireSelection>;
