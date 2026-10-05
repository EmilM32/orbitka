import type { Object3D } from 'three';

export type RenderStatsSource = {
  info: {
    render: {
      calls: number;
      triangles: number;
    };
  };
};

// drawCalls leaves out debug objects (userData.debug), so it is the number
// DRAW_CALL_BUDGET applies to (ADR-006, ADR-009). debugDrawCalls has no limit.
export type RenderStats = {
  drawCalls: number;
  debugDrawCalls: number;
  triangles: number;
};

export type DebugDrawCounter = {
  readonly count: number;
  reset(): void;
  dispose(): void;
};

type Count = 'calls' | 'triangles' | 'debugDrawCalls';

function requireCount(parameter: Count, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `getRenderStats: parameter "${parameter}" must be finite and >= 0, got ${value}`,
    );
  }
}

export function getRenderStats(
  source: RenderStatsSource,
  debugDrawCalls = 0,
): RenderStats {
  const calls = source.info.render.calls;
  const triangles = source.info.render.triangles;
  requireCount('calls', calls);
  requireCount('triangles', triangles);
  requireCount('debugDrawCalls', debugDrawCalls);
  if (debugDrawCalls > calls) {
    throw new RangeError(
      `getRenderStats: parameter "debugDrawCalls" must be <= calls (${calls}), got ${debugDrawCalls}`,
    );
  }

  return { drawCalls: calls - debugDrawCalls, debugDrawCalls, triangles };
}

export function isDebugObject(object: Object3D): boolean {
  return object.userData.debug === true;
}

// three calls onBeforeRender once per draw call, after frustum culling, so the
// counter matches renderer.info.render.calls for the marked objects. Objects
// marked after this call are not counted.
export function trackDebugDrawCalls(root: Object3D): DebugDrawCounter {
  const tracked: { object: Object3D; previous: Object3D['onBeforeRender'] }[] =
    [];
  let count = 0;

  root.traverse((object) => {
    if (!isDebugObject(object)) {
      return;
    }

    const previous = object.onBeforeRender;
    object.onBeforeRender = function (...args) {
      count += 1;
      previous.apply(this, args);
    };
    tracked.push({ object, previous });
  });

  return {
    get count() {
      return count;
    },
    reset() {
      count = 0;
    },
    dispose() {
      for (const { object, previous } of tracked) {
        object.onBeforeRender = previous;
      }
      tracked.length = 0;
    },
  };
}
