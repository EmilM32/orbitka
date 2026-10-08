import type { Camera, Scene, WebGLRenderer } from 'three';

export type FrameRenderer = {
  render(): void;
  getPostFxDrawCalls(): number;
  dispose(): void;
};

// The only place in src that calls renderer.render (ADR-010 point 8). With
// autoReset off, renderer.info sums every render() since the last reset(), so
// the reset runs exactly once per frame, before the scene. Stage 2 adds its
// post-processing passes here and reports them through getPostFxDrawCalls.
export function createFrameRenderer(options: {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
}): FrameRenderer {
  const { renderer, scene, camera } = options;
  renderer.info.autoReset = false;
  let disposed = false;

  return {
    render() {
      if (disposed) {
        return;
      }

      renderer.info.reset();
      renderer.render(scene, camera);
    },
    getPostFxDrawCalls() {
      return 0;
    },
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      renderer.info.autoReset = true;
    },
  };
}
