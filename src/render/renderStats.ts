export type RenderStatsSource = {
  info: {
    render: {
      calls: number;
      triangles: number;
    };
  };
};

export type RenderStats = {
  calls: number;
  triangles: number;
};

function requireCount(parameter: 'calls' | 'triangles', value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `getRenderStats: parameter "${parameter}" must be finite and >= 0, got ${value}`,
    );
  }
}

export function getRenderStats(source: RenderStatsSource): RenderStats {
  const calls = source.info.render.calls;
  const triangles = source.info.render.triangles;
  requireCount('calls', calls);
  requireCount('triangles', triangles);
  return { calls, triangles };
}
