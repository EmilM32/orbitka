import { showSceneUnavailable } from '@ui/sceneUnavailable.ts';
import { createCanvasKeyboard } from '@render/canvasKeyboard.ts';

import { createDisposables } from './disposables.ts';
import type { AppI18n } from './types.ts';
import type { SelectionRig } from './wireSelection.ts';
import type { ViewRig } from './wireView.ts';

/** Canvas events: keyboard control and the way out after a context loss. */
export function wireCanvas(
  canvas: HTMLCanvasElement,
  i18n: AppI18n,
  viewRig: ViewRig,
  selectionRig: SelectionRig,
) {
  const stack = createDisposables();
  // three stops the loop on context loss; the student gets a way out.
  const onContextLost = (): void => {
    console.error('WebGL context lost; the scene stopped rendering.');
    showSceneUnavailable(document.body, i18n, 'lost');
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  // dispose() forces a context loss itself, so stop listening first.
  stack.add(() => {
    canvas.removeEventListener('webglcontextlost', onContextLost);
  });
  const canvasKeyboard = createCanvasKeyboard({
    surface: canvas,
    controller: viewRig.cameraController,
    onShowSystem: () => {
      selectionRig.selection.showSystem();
    },
    ariaLabel: i18n.t('canvas.ariaLabel'),
  });
  stack.add(() => {
    canvasKeyboard.dispose();
  });

  return { dispose: stack.disposeAll };
}
