import { createFpsMeter } from '@core/fpsMeter.ts';
import { isDebugEnabled } from '@core/debugFlag.ts';

import { createDebugOverlay, type DebugStats } from './debugOverlay.ts';

export type DebugSession = {
  tick(nowMs: number): void;
  update(stats: Pick<DebugStats, 'calls' | 'triangles'>): void;
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
        calls: stats.calls,
        triangles: stats.triangles,
      });
    },
    dispose() {
      overlay.dispose();
    },
  };
}
