import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';

import { resolvePixelRatio } from './pixelRatio.ts';

const CLEAR_COLOR = 0x000000;
const CAMERA_FOV = 45;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 2000;
const CAMERA_START = { x: 0, y: 40, z: 90 } as const;

export type SceneView = {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  dispose: () => void;
};

export function createRenderer(canvas: HTMLCanvasElement): SceneView {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(CLEAR_COLOR, 1);

  const scene = new Scene();
  const camera = new PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
  camera.position.set(CAMERA_START.x, CAMERA_START.y, CAMERA_START.z);
  camera.lookAt(0, 0, 0);

  const resize = (): void => {
    const width = document.body.clientWidth;
    const height = document.body.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }

    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    renderer.setPixelRatio(
      resolvePixelRatio(window.devicePixelRatio, coarsePointer),
    );
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(document.body);

  let disposed = false;

  return {
    renderer,
    scene,
    camera,
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      observer.disconnect();
      renderer.setAnimationLoop(null);
      renderer.dispose();
    },
  };
}
