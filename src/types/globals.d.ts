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

export type OrbitkaClockState = {
  days: number;
  speed: number;
  reversed: boolean;
  paused: boolean;
  presetId: string | null;
};

export type OrbitkaScenePosition = {
  x: number;
  y: number;
  z: number;
};

export type OrbitkaFrameSnapshot = {
  days: number;
  earth: OrbitkaScenePosition;
};

declare global {
  interface Window {
    __orbitka?: {
      readonly frameCount: number;
      getRenderStats: () => OrbitkaRenderStats;
      getBodyScreenPositions: () => OrbitkaBodyScreenPosition[];
      getClock: () => OrbitkaClockState;
      getBodyScenePosition: (id: string) => OrbitkaScenePosition | null;
      getFrameSnapshot: () => OrbitkaFrameSnapshot | null;
    };
  }
}

export {};
