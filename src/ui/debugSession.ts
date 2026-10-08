import { createFpsMeter } from '@core/fpsMeter.ts';
import { isDebugEnabled } from '@core/debugFlag.ts';

import { createDebugOverlay, type DebugStats } from './debugOverlay.ts';

export type DebugSession = {
  tick(nowMs: number): void;
  update(stats: Omit<DebugStats, 'fps'>): void;
  dispose(): void;
};

export function createDebugSession(
  search: string,
  parent: HTMLElement,
): DebugSession | null {
  if (!isDebugEnabled(search)) {
    return null;
  }

  const meter = createFpsMeter();
  const overlay = createDebugOverlay(parent);

  return {
    tick(nowMs: number) {
      meter.tick(nowMs);
    },
    update(stats) {
      overlay.update({
        fps: meter.fps,
        drawCalls: stats.drawCalls,
        postFxDrawCalls: stats.postFxDrawCalls,
        triangles: stats.triangles,
        textureMiB: stats.textureMiB,
      });
    },
    dispose() {
      overlay.dispose();
    },
  };
}
