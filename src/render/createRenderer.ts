import {
  ACESFilmicToneMapping,
  Scene,
  WebGLRenderer,
  type Material,
  type Object3D,
  type PerspectiveCamera,
  type Texture,
} from 'three';

import { createCamera } from './camera.ts';
import { resolvePixelRatio } from './pixelRatio.ts';
import { watchDevicePixelRatio } from './watchDevicePixelRatio.ts';

const CLEAR_COLOR = 0x000000;

export type ResizeListener = (width: number, height: number) => void;

export type SceneView = {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  syncPixelRatio: () => void;
  /** Upper bound on the pixel ratio from the quality level; null = none. */
  setPixelRatioCap: (cap: number | null) => void;
  getPixelRatio: () => number;
  requestFrame: (tick: () => void) => void;
  cancelFrame: () => void;
  onResize: (listener: ResizeListener) => () => void;
  dispose: () => void;
};

export function createRenderer(canvas: HTMLCanvasElement): SceneView {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(CLEAR_COLOR, 1);
  // ADR-010 point 5: ACES already in stage 1; bloom comes in stage 2.
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new Scene();
  const initialWidth = document.body.clientWidth;
  const initialHeight = document.body.clientHeight;
  const initialAspect =
    initialWidth > 0 && initialHeight > 0 ? initialWidth / initialHeight : 1;
  const camera = createCamera(initialAspect);
  const resizeListeners: ResizeListener[] = [];

  let appliedDevicePixelRatio = window.devicePixelRatio;
  let pixelRatioCap = Number.POSITIVE_INFINITY;

  const resize = (): void => {
    const width = document.body.clientWidth;
    const height = document.body.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }

    appliedDevicePixelRatio = window.devicePixelRatio;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    renderer.setPixelRatio(
      resolvePixelRatio(appliedDevicePixelRatio, coarsePointer, pixelRatioCap),
    );
    renderer.setSize(width, height, false);
    // Do not reframe. Distance scaling belongs to the camera controller.
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    for (let index = 0; index < resizeListeners.length; index += 1) {
      resizeListeners[index]?.(width, height);
    }
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
    setPixelRatioCap(cap) {
      const next = cap ?? Number.POSITIVE_INFINITY;
      if (next === pixelRatioCap) {
        return;
      }
      pixelRatioCap = next;
      resize();
    },
    getPixelRatio() {
      return renderer.getPixelRatio();
    },
    requestFrame(tick: () => void) {
      renderer.setAnimationLoop(() => {
        tick();
      });
    },
    cancelFrame() {
      renderer.setAnimationLoop(null);
    },
    onResize(listener: ResizeListener) {
      resizeListeners.push(listener);
      return () => {
        const index = resizeListeners.indexOf(listener);
        if (index >= 0) {
          resizeListeners.splice(index, 1);
        }
      };
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
