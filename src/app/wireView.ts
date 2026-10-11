import { createReducedMotion } from '@core/reducedMotion.ts';
import { createCameraController } from '@render/cameraController.ts';
import { createCameraPointerInput } from '@render/cameraPointerInput.ts';
import { createRenderer } from '@render/createRenderer.ts';
import { createFrameRenderer } from '@render/frameRenderer.ts';
import { createTextureMemory } from '@render/textureMemory.ts';

import { createDisposables } from './disposables.ts';

/** The renderer, the camera and the pointer input on the canvas. */
export function wireView(canvas: HTMLCanvasElement) {
  const stack = createDisposables();
  const view = createRenderer(canvas);
  stack.add(() => {
    view.dispose();
  });
  const frameRenderer = createFrameRenderer(view);
  stack.add(() => {
    frameRenderer.dispose();
  });
  // Every texture made in render is tracked here (ADR-010 point 8).
  const textureMemory = createTextureMemory();
  stack.add(() => {
    textureMemory.dispose();
  });
  const reducedMotion = createReducedMotion(window.matchMedia.bind(window));
  stack.add(() => {
    reducedMotion.dispose();
  });
  const cameraController = createCameraController({
    camera: view.camera,
    reducedMotion,
  });
  stack.add(() => {
    cameraController.dispose();
  });
  // The canvas size in CSS pixels, kept current by the resize listener.
  const size = {
    width: document.body.clientWidth,
    height: document.body.clientHeight,
  };
  stack.add(
    view.onResize((width, height) => {
      size.width = width;
      size.height = height;
      cameraController.setAspect(width / height);
    }),
  );
  const pointerInput = createCameraPointerInput({
    surface: canvas,
    controller: cameraController,
  });
  stack.add(() => {
    pointerInput.dispose();
  });

  return {
    view,
    frameRenderer,
    textureMemory,
    reducedMotion,
    cameraController,
    pointerInput,
    size,
    dispose: stack.disposeAll,
  };
}

export type ViewRig = ReturnType<typeof wireView>;
