import type { Object3D } from 'three';

export type RenderStatsSource = {
  info: {
    render: {
      calls: number;
      triangles: number;
    };
  };
};

// drawCalls leaves out debug objects (userData.debug) and post-processing
// passes, so it is the number DRAW_CALL_BUDGET applies to (ADR-010 point 8).
// debugDrawCalls has no limit; postFxDrawCalls has POSTFX_DRAW_CALL_BUDGET.
export type RenderStats = {
  drawCalls: number;
  debugDrawCalls: number;
  postFxDrawCalls: number;
  triangles: number;
  textureMiB: number;
};

export type RenderStatsExtras = {
  debugDrawCalls?: number;
  postFxDrawCalls?: number;
  textureMiB?: number;
};

export type DebugDrawCounter = {
  readonly count: number;
  reset(): void;
  dispose(): void;
};

type Count =
  'calls' | 'triangles' | 'debugDrawCalls' | 'postFxDrawCalls' | 'textureMiB';

function requireCount(parameter: Count, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `getRenderStats: parameter "${parameter}" must be finite and >= 0, got ${value}`,
    );
  }
}

export function getRenderStats(
  source: RenderStatsSource,
  extras: RenderStatsExtras = {},
): RenderStats {
  const calls = source.info.render.calls;
  const triangles = source.info.render.triangles;
  const debugDrawCalls = extras.debugDrawCalls ?? 0;
  const postFxDrawCalls = extras.postFxDrawCalls ?? 0;
  const textureMiB = extras.textureMiB ?? 0;
  requireCount('calls', calls);
  requireCount('triangles', triangles);
  requireCount('debugDrawCalls', debugDrawCalls);
  requireCount('postFxDrawCalls', postFxDrawCalls);
  requireCount('textureMiB', textureMiB);
  // Before the first frame calls can be smaller than the parts it contains.
  if (debugDrawCalls + postFxDrawCalls > calls) {
    throw new RangeError(
      `getRenderStats: parameters "debugDrawCalls" + "postFxDrawCalls" must be <= calls (${calls}), got ${debugDrawCalls + postFxDrawCalls}`,
    );
  }

  return {
    drawCalls: calls - debugDrawCalls - postFxDrawCalls,
    debugDrawCalls,
    postFxDrawCalls,
    triangles,
    textureMiB,
  };
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
