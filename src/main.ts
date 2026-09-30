import './style.css';

import { createLoop } from '@core/loop.ts';
import { createRenderer } from '@render/createRenderer.ts';

const canvas = document.querySelector<HTMLCanvasElement>('#viewport');

if (!canvas) {
  throw new Error('Brak elementu canvas #viewport');
}

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

const dispose = (): void => {
  loop.stop();
  document.removeEventListener('visibilitychange', onVisibilityChange);
  view.dispose();
};

if (import.meta.hot) {
  import.meta.hot.dispose(dispose);
  import.meta.hot.accept();
}
