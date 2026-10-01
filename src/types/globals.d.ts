export type OrbitkaBodyScreenPosition = {
  id: string;
  type: string;
  x: number;
  y: number;
  visible: boolean;
};

declare global {
  interface Window {
    __orbitka?: {
      getBodyScreenPositions: () => OrbitkaBodyScreenPosition[];
    };
  }
}

export {};
