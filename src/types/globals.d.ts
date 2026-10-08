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

/** Numbers only. `flightKind`: 0 none, 1 body, 2 system. */
export type OrbitkaCameraState = {
  azimuthDeg: number;
  polarDeg: number;
  distance: number;
  distanceMin: number;
  distanceMax: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  flightActive: number;
  flightKind: number;
  flightProgress: number;
  selectedRadius: number;
};

/** `visible` is 0 or 1. `opacities` is Mercury through Neptune. */
export type OrbitkaOrbitState = {
  visible: number;
  opacities: number[];
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
      getCameraState: () => OrbitkaCameraState;
      getSelectedId: () => string | null;
      getOrbitState: () => OrbitkaOrbitState;
      getViewInsets: () => { right: number; bottom: number };
    };
  }
}

export {};
