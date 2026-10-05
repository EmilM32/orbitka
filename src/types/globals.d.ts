export type OrbitkaBodyScreenPosition = {
  id: string;
  type: string;
  x: number;
  y: number;
  visible: boolean;
};

export type OrbitkaRenderStats = {
  drawCalls: number;
  debugDrawCalls: number;
  triangles: number;
};

declare global {
  interface Window {
    __orbitka?: {
      readonly frameCount: number;
      getRenderStats: () => OrbitkaRenderStats;
      getBodyScreenPositions: () => OrbitkaBodyScreenPosition[];
    };
  }
}

export {};
