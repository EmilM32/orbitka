import {
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
} from 'three';

import { resolvePixelRatio } from './pixelRatio.ts';
import { watchDevicePixelRatio } from './watchDevicePixelRatio.ts';

const CLEAR_COLOR = 0x000000;
const CAMERA_FOV = 45;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 2000;
const CAMERA_START = { x: 0, y: 40, z: 90 } as const;

export type SceneView = {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  syncPixelRatio: () => void;
  dispose: () => void;
};

export function createRenderer(canvas: HTMLCanvasElement): SceneView {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(CLEAR_COLOR, 1);

  const scene = new Scene();
  const camera = new PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
  camera.position.set(CAMERA_START.x, CAMERA_START.y, CAMERA_START.z);
  camera.lookAt(0, 0, 0);

  let appliedDevicePixelRatio = window.devicePixelRatio;

  const resize = (): void => {
    const width = document.body.clientWidth;
    const height = document.body.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }

    appliedDevicePixelRatio = window.devicePixelRatio;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    renderer.setPixelRatio(
      resolvePixelRatio(appliedDevicePixelRatio, coarsePointer),
    );
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(document.body);
  const resolution = watchDevicePixelRatio({
    getDevicePixelRatio: () => window.devicePixelRatio,
    matchMedia: (query) => window.matchMedia(query),
    onChange: resize,
  });

  let disposed = false;

  return {
    renderer,
    scene,
    camera,
    syncPixelRatio() {
      if (window.devicePixelRatio !== appliedDevicePixelRatio) {
        resize();
      }
    },
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      resolution.dispose();
      observer.disconnect();
      renderer.setAnimationLoop(null);
      disposeSceneResources(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      replaceCanvas(canvas);
    },
  };
}

function replaceCanvas(canvas: HTMLCanvasElement): void {
  const replacement = canvas.cloneNode() as HTMLCanvasElement;
  canvas.replaceWith(replacement);
}

function disposeSceneResources(scene: Scene): void {
  scene.traverse((object) => {
    if (!hasResources(object)) {
      return;
    }

    object.geometry?.dispose();

    if (!object.material) {
      return;
    }

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    for (const material of materials) {
      disposeMaterial(material);
    }
  });
}

function hasResources(object: Object3D): object is Object3D & {
  geometry?: { dispose: () => void };
  material?: Material | Material[];
} {
  return 'geometry' in object || 'material' in object;
}

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) {
    disposeTextures(value);
  }

  material.dispose();
}

function disposeTextures(value: unknown): void {
  if (isTexture(value)) {
    value.dispose();
    return;
  }

  if (!Array.isArray(value)) {
    return;
  }

  for (const item of value) {
    if (isTexture(item)) {
      item.dispose();
    }
  }
}

function isTexture(value: unknown): value is Texture {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isTexture' in value &&
    value.isTexture === true
  );
}
