import './style.css';

import { createLoop } from '@core/loop.ts';
import { createRenderer } from '@render/createRenderer.ts';

type App = {
  dispose: () => void;
};

function findCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>('#viewport');

  if (!canvas) {
    throw new Error('Brak elementu canvas #viewport');
  }

  return canvas;
}

function mount(canvas: HTMLCanvasElement): App {
  const view = createRenderer(canvas);

  const loop = createLoop({
    update() {},
    render() {
      view.syncPixelRatio();
      view.renderer.render(view.scene, view.camera);
    },
    requestFrame(tick) {
      view.renderer.setAnimationLoop(() => {
        tick();
      });
    },
    cancelFrame() {
      view.renderer.setAnimationLoop(null);
    },
  });

  const onVisibilityChange = (): void => {
    if (document.hidden) {
      loop.stop();
    } else {
      loop.start();
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);

  if (!document.hidden) {
    loop.start();
  }

  return {
    dispose() {
      loop.stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      view.dispose();
    },
  };
}

// Vite keeps every replaced version of this module alive, so after HMR the
// module scope must not hold the renderer, the scene, or the old canvas.
let app: App | null = mount(findCanvas());

const dispose = (): void => {
  app?.dispose();
  app = null;
};

if (import.meta.hot) {
  import.meta.hot.dispose(dispose);
  import.meta.hot.accept();
}
