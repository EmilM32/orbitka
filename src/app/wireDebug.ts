import { isDebugEnabled } from '@core/debugFlag.ts';
import { bodies } from '@data/bodies.ts';
import { addDebugAxes } from '@render/debugAxes.ts';
import { getRenderStats, trackDebugDrawCalls } from '@render/renderStats.ts';
import { getBodyScenePosition } from '@render/scenePosition.ts';
import { createDebugSession } from '@ui/debugSession.ts';

import { installDebugProbe } from './debugProbe.ts';
import { createDisposables } from './disposables.ts';
import type { SceneRig } from './wireScene.ts';
import type { SelectionRig } from './wireSelection.ts';
import type { TimeRig } from './wireTime.ts';
import type { ViewRig } from './wireView.ts';

export type DebugInputs = {
  canvas: HTMLCanvasElement;
  search: string;
  viewRig: ViewRig;
  sceneRig: SceneRig;
  selectionRig: SelectionRig;
  timeRig: TimeRig;
};

/**
 * The `debug` flag: axes, draw-call counts, the FPS overlay and the
 * `window.__orbitka` probe for tests. Every hook does nothing without it.
 */
export function wireDebug({
  canvas,
  search,
  viewRig,
  sceneRig,
  selectionRig,
  timeRig,
}: DebugInputs) {
  const { view, frameRenderer, textureMemory } = viewRig;
  const { bodyView, quality } = sceneRig;
  const { clock } = timeRig;
  const stack = createDisposables();
  const debug = isDebugEnabled(search);
  const debugAxes = debug ? addDebugAxes(bodies, bodyView.meshes) : null;
  const debugDraws = debug ? trackDebugDrawCalls(view.scene) : null;
  const debugSession = createDebugSession(search, document.body);
  let lastUiMs = Number.NEGATIVE_INFINITY;
  let frameCount = 0;
  let presetId: string | null = null;
  let frameSnapshot: {
    days: number;
    earth: { x: number; y: number; z: number };
  } | null = null;
  const readRenderStats = () =>
    getRenderStats(view.renderer, {
      debugDrawCalls: debugDraws?.count ?? 0,
      postFxDrawCalls: frameRenderer.getPostFxDrawCalls(),
      textureMiB: textureMemory.getMiB(),
    });
  const readQuality = () => {
    const summary = quality.getLastSummary();
    return {
      level: quality.get(),
      source: quality.getSource(),
      locked: quality.isLocked(),
      medianFps: summary?.medianFps ?? null,
      p90FrameMs: summary?.p90FrameMs ?? null,
      pixelRatio: view.getPixelRatio(),
    };
  };

  if (debug) {
    stack.add(
      clock.subscribe((state) => {
        presetId = state.presetId;
      }),
    );
    stack.add(
      installDebugProbe({
        canvas,
        viewRig,
        sceneRig,
        selectionRig,
        timeRig,
        readFrameCount: () => frameCount,
        readFrameSnapshot: () => frameSnapshot,
        readPresetId: () => presetId,
        readRenderStats,
        readQuality,
      }),
    );
  }
  stack.add(() => {
    debugSession?.dispose();
  });
  stack.add(() => {
    debugDraws?.dispose();
  });
  stack.add(() => {
    debugAxes?.dispose();
  });

  return {
    /** Before the frame is drawn: draw calls are counted per frame. */
    beginFrame(): void {
      debugDraws?.reset();
    },
    /**
     * After the animators, so days and the Earth mesh are from this frame.
     * Stays null until the loop has run once. The mount-time animator update
     * is not a frame.
     */
    afterUpdate(): void {
      if (!debug) {
        return;
      }

      const earth = getBodyScenePosition(bodyView.meshes, 'earth');
      frameSnapshot = earth === null ? null : { days: clock.days, earth };
    },
    afterRender(): void {
      if (debugSession === null) {
        return;
      }

      frameCount += 1;
      const nowMs = performance.now();
      debugSession.tick(nowMs);
      if (nowMs - lastUiMs >= 100) {
        debugSession.update({ ...readRenderStats(), quality: readQuality() });
        lastUiMs = nowMs;
      }
    },
    dispose: stack.disposeAll,
  };
}

export type DebugRig = ReturnType<typeof wireDebug>;
