import { createDisposables } from './disposables.ts';
import { parseViewParams } from '@core/viewParams.ts';
import { interiors } from '@data/interiors.ts';
import { loadBodyContent } from './contentCatalog.ts';
import { interiorCardViews, loadInteriorContent } from './interiorViews.ts';
import { localStore } from './storage.ts';
import type { App, AppI18n } from './types.ts';
import { wireCanvas } from './wireCanvas.ts';
import { wireDebug } from './wireDebug.ts';
import { wireLoop } from './wireLoop.ts';
import { wireIntro } from './wireIntro.ts';
import { wireStartFrame } from './wireStartFrame.ts';
import { wireOverlays } from './wireOverlays.ts';
import { wireScene } from './wireScene.ts';
import { wireSelection } from './wireSelection.ts';
import { wireTime } from './wireTime.ts';
import { wireUi } from './wireUi.ts';
import { wireView } from './wireView.ts';

export type MountOptions = {
  i18n: AppI18n;
  /** The raw body content JSON; `main.ts` is the only importer of it. */
  bodyContentRaw: unknown;
  /** The raw interior copy JSON; `main.ts` is the only importer of it. */
  interiorContentRaw: unknown;
};

/**
 * Builds the app on the canvas by wiring the layers together. Each `wire*`
 * step returns a `dispose`; they run in the reverse order of creation.
 */
export function mount(
  canvas: HTMLCanvasElement,
  { i18n, bodyContentRaw, interiorContentRaw }: MountOptions,
): App {
  const stack = createDisposables();
  try {
    const storage = localStore();
    const search = window.location.search;

    const viewRig = wireView(canvas);
    stack.add(viewRig.dispose);
    const sceneRig = wireScene({ viewRig, storage, search });
    stack.add(sceneRig.dispose);
    const selectionRig = wireSelection(canvas, viewRig, sceneRig);
    stack.add(selectionRig.dispose);
    const viewParams = parseViewParams(
      search,
      selectionRig.selectable.map((body) => body.id),
      [...interiors.keys()],
    );
    if (import.meta.env.DEV && viewParams.ignored.length > 0) {
      console.warn(
        `Ignored unusable address parameters: ${viewParams.ignored.join(', ')}`,
      );
    }
    const timeRig = wireTime(sceneRig, search, viewParams);
    const canvasRig = wireCanvas(canvas, i18n, viewRig, selectionRig);
    stack.add(canvasRig.dispose);
    const uiRig = wireUi({
      canvas,
      i18n,
      storage,
      bodyContent: loadBodyContent(bodyContentRaw),
      interiors: interiorCardViews(loadInteriorContent(interiorContentRaw)),
      initialCutaway: viewParams.cutaway,
      viewRig,
      sceneRig,
      selectionRig,
      timeRig,
    });
    stack.add(uiRig.dispose);
    const overlayRig = wireOverlays({
      i18n,
      storage,
      // A student who comes from a teacher's link starts in that view, not in the training.
      skipCoach: viewParams.bodyId !== null,
      viewRig,
      sceneRig,
      selectionRig,
      uiRig,
    });
    stack.add(overlayRig.dispose);
    const startFrameRig = wireStartFrame(viewRig, uiRig);
    stack.add(startFrameRig.dispose);
    const introRig = wireIntro({
      search,
      hasStartBody: viewParams.bodyId !== null,
      viewRig,
      selectionRig,
      uiRig,
      overlayRig,
    });
    stack.add(introRig.dispose);
    const debugRig = wireDebug({
      canvas,
      search,
      viewRig,
      sceneRig,
      selectionRig,
      timeRig,
      overlayRig,
      introRig,
    });
    stack.add(debugRig.dispose);
    const loopRig = wireLoop({
      startBodyId: viewParams.bodyId,
      introRig,
      viewRig,
      sceneRig,
      selectionRig,
      timeRig,
      uiRig,
      overlayRig,
      debugRig,
    });
    stack.add(loopRig.dispose);
  } catch (error) {
    stack.disposeAll();
    throw error;
  }

  return { dispose: stack.disposeAll };
}
